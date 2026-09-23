/**
 * p77 STORY-003 — the `cutover_operator+jwt` VERIFIER (D23, specs.md §6.5 step 1).
 *
 * WHY. While the estate maintenance switch is on, every mutating cutover op an
 * RP receives carries `X-Cutover-Operator`: an RS256 token the IdP minted from
 * the switch row, whose `jti` IS the switch's current `jti`. The RP verifies it
 * OFFLINE here — signature with the same JWKS path the logout verifier uses,
 * `iss`, `aud` (this RP's system name), `exp`, `env` equal to the RP's own
 * `CONNECT_ENV`, and the requested `op ∈ ops` — and only then reads the switch
 * LIVE (`readEstateMaintenance` with `maxAgeMs: 0`) to compare the `jti`. Both
 * halves are pure verification: the route factory (STORY-005) decides what a
 * refusal answers.
 *
 * Refusals map to §6.5's three: `operator_invalid` (anything structural —
 * signature, typ, iss, aud, exp, a malformed claim set), `operator_env_mismatch`
 * and `op_not_permitted`. A JWKS that could not be READ is `operator_invalid`
 * with `transient: true`, so the route can answer 503 instead of 403 — an IdP
 * outage must not read as a forged token.
 */

import { audienceContains, decodeJson, verifyCompactJws } from './logout-token.js'

export const OPERATOR_TOKEN_TYP = 'cutover_operator+jwt'

export type OperatorTokenRefusal = 'operator_invalid' | 'operator_env_mismatch' | 'op_not_permitted'

export type OperatorTokenVerification =
  | { ok: true; jti: string; env: string; ops: string[] }
  | { ok: false; reason: OperatorTokenRefusal; transient: boolean; detail: string }

export interface OperatorTokenVerifierDeps {
  /** The configured Connect issuer. */
  issuer: string
  /** This RP's system name — must appear in the token's `aud`. */
  audience: string
  /** This RP's `CONNECT_ENV` (`local | dev | prod`). */
  env: string
  /** The op the request performs — must appear in `claims.ops`. */
  op: string
  fetchImpl?: typeof fetch
  /** Seconds since the epoch. Defaults to the wall clock. */
  now?: () => number
  /** Allowance for `exp` in the past. Default 60 s. */
  clockSkewSeconds?: number
}

export async function verifyOperatorToken(
  rawToken: string,
  deps: OperatorTokenVerifierDeps,
): Promise<OperatorTokenVerification> {
  const invalid = (detail: string, transient = false): OperatorTokenVerification => ({
    ok: false,
    reason: 'operator_invalid',
    transient,
    detail,
  })
  const issuer = (deps.issuer ?? '').trim()
  if (!issuer || !deps.audience || !deps.env || !deps.op) return invalid('verifier not configured', true)
  if (typeof rawToken !== 'string' || !rawToken) return invalid('missing token')
  const now = deps.now ? deps.now() : Math.floor(Date.now() / 1000)
  const skew = deps.clockSkewSeconds ?? 60

  // `typ` is REQUIRED and exact here, unlike the logout verifier's lenient
  // set: an id_token, a logout token or an access token must never be
  // presentable as operator authority, and a token this specific has no
  // interop case for omitting it.
  const parts = rawToken.split('.')
  if (parts.length !== 3) return invalid('malformed')
  const header = decodeJson(parts[0]!)
  if (!header) return invalid('malformed')
  if (typeof header.typ !== 'string' || header.typ.toLowerCase() !== OPERATOR_TOKEN_TYP) return invalid('bad typ')

  const jws = await verifyCompactJws(rawToken, {
    issuer,
    fetchImpl: deps.fetchImpl ?? fetch,
    nowSeconds: now,
    allowedAlgs: ['RS256'],
  })
  if (!jws.ok) return invalid(jws.reason, jws.transient)
  const c = jws.claims

  if (typeof c.iss !== 'string' || c.iss !== issuer) return invalid('issuer mismatch')
  if (!audienceContains(c.aud, deps.audience)) return invalid('audience mismatch')
  const exp = c.exp
  if (typeof exp !== 'number' || !Number.isFinite(exp)) return invalid('missing exp')
  if (now > exp + skew) return invalid('expired')
  const iat = c.iat
  if (typeof iat === 'number' && Number.isFinite(iat) && iat > now + skew) return invalid('not yet issued')
  const jti = typeof c.jti === 'string' && c.jti.trim() ? c.jti.trim() : null
  if (!jti) return invalid('missing jti')
  const env = typeof c.env === 'string' && c.env.trim() ? c.env.trim() : null
  if (!env) return invalid('missing env')
  const ops = Array.isArray(c.ops) ? c.ops.filter((o): o is string => typeof o === 'string') : null
  if (!ops) return invalid('missing ops')

  if (env !== deps.env) {
    return { ok: false, reason: 'operator_env_mismatch', transient: false, detail: `token env ${env}, rp env ${deps.env}` }
  }
  if (!ops.includes(deps.op)) {
    return { ok: false, reason: 'op_not_permitted', transient: false, detail: `op ${deps.op} not in ops` }
  }
  return { ok: true, jti, env, ops }
}
