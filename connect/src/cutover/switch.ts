/**
 * p77 STORY-005 — the estate maintenance SWITCH ROW and the OPERATOR TOKEN
 * as the cutover library sees them (D23, D26, §6.5).
 *
 * The row lives in the Yobo instance's `system_config` under
 * `auth.estate_maintenance` (STORY-040 reads it; STORY-036 writes it).
 * This package never touches that table: it speaks to a
 * `MaintenanceSwitchStore` the IdP supplies (`read` / `write`), and mints
 * operator tokens through an `OperatorTokenSigner` the IdP supplies (its
 * JWKS signing key — the logout-token signer). The library decides WHEN a
 * mint is legal (never while a lift is in progress unless for the lifter,
 * never with the switch off) and WHAT the claims are; the signature is the
 * IdP's.
 */

import type { RpSystem } from '../adapter/index.js'
import type { ConnectEnv, HandoffOp } from '../next-auth/internal-routes.js'
import { OPERATOR_TOKEN_TYP } from '../server/revocation/operator-token.js'

/** The switch row value (D26), camelCase here; STORY-040/036 store it snake_case in `config_value`. */
export interface MaintenanceSwitchRow {
  active: boolean
  jti: string | null
  since: string | null
  reason: string | null
  operator: string | null
  extendedUntil: string | null
  extensions: Array<{ at: string; minutes: number; reason: string }>
  firstActivationAt: string | null
  liftingSince: string | null
  liftedAt: string | null
}

export const OFF_SWITCH_ROW: MaintenanceSwitchRow = {
  active: false,
  jti: null,
  since: null,
  reason: null,
  operator: null,
  extendedUntil: null,
  extensions: [],
  firstActivationAt: null,
  liftingSince: null,
  liftedAt: null,
}

export interface MaintenanceSwitchStore {
  /** The row, or null when absent (= off). */
  read(): Promise<MaintenanceSwitchRow | null>
  /** Replace the row (one write). */
  write(row: MaintenanceSwitchRow): Promise<void>
}

/** The operator token's claims (D23). `exp = iat + 15 min`. */
export interface OperatorTokenClaims {
  iss: string
  aud: RpSystem[]
  jti: string
  env: ConnectEnv
  ops: HandoffOp[]
  iat: number
  exp: number
}

/** The IdP's signer: RS256 with its JWKS key, `typ: cutover_operator+jwt`. */
export type OperatorTokenSigner = (claims: OperatorTokenClaims, header: { typ: typeof OPERATOR_TOKEN_TYP; alg: 'RS256' }) => Promise<string>

export const OPERATOR_TOKEN_TTL_SECONDS = 15 * 60
/** The driver re-mints this often (D23). */
export const OPERATOR_TOKEN_REMINT_MS = 10 * 60 * 1000

export class MintRefusedError extends Error {
  constructor(public readonly code: 'maintenance_off' | 'lifting') {
    super(code === 'lifting' ? 'a lift is in progress; no operator token is minted until it completes or is refused' : 'the estate maintenance switch is off; nothing to mint from')
    this.name = 'MintRefusedError'
  }
}

export interface MintOperatorTokenInput {
  store: MaintenanceSwitchStore
  sign: OperatorTokenSigner
  issuer: string
  env: ConnectEnv
  /** Every RP system registered for the environment (`CONNECT_RP_ORIGINS_JSON`), never a participant set. */
  audience: readonly RpSystem[]
  ops: readonly HandoffOp[]
  /** The lifter mints from the rotated jti while `lifting_since` is set. */
  forLifter?: boolean
  now?: () => Date
}

/**
 * Mint an operator token from the row as it stands. Refused with the switch
 * off, or while a lift is in progress (unless for the lifter).
 */
export async function mintOperatorToken(input: MintOperatorTokenInput): Promise<{ token: string; jti: string; claims: OperatorTokenClaims }> {
  const row = (await input.store.read()) ?? OFF_SWITCH_ROW
  if (!row.active || !row.jti) throw new MintRefusedError('maintenance_off')
  if (row.liftingSince && !input.forLifter) throw new MintRefusedError('lifting')
  const iat = Math.floor((input.now ?? (() => new Date()))().getTime() / 1000)
  const claims: OperatorTokenClaims = {
    iss: input.issuer.replace(/\/+$/, ''),
    aud: [...input.audience],
    jti: row.jti,
    env: input.env,
    ops: [...input.ops],
    iat,
    exp: iat + OPERATOR_TOKEN_TTL_SECONDS,
  }
  const token = await input.sign(claims, { typ: OPERATOR_TOKEN_TYP, alg: 'RS256' })
  return { token, jti: row.jti, claims }
}

/**
 * A token provider that re-mints every 10 minutes from the CURRENT row, so a
 * long `--execute` never presents an expired token and a rotation is seen
 * at the next mint. Throws `MintRefusedError` when minting is refused.
 */
export function createRemintingTokenProvider(input: Omit<MintOperatorTokenInput, 'now'> & { now?: () => Date; remintEveryMs?: number }): {
  current(): string | null
  refresh(): Promise<string>
  /** The jti of the last mint. */
  jti(): string | null
} {
  const now = input.now ?? (() => new Date())
  const every = input.remintEveryMs ?? OPERATOR_TOKEN_REMINT_MS
  let token: string | null = null
  let jti: string | null = null
  let mintedAt = 0
  return {
    current: () => token,
    jti: () => jti,
    async refresh() {
      const t = now().getTime()
      if (token && t - mintedAt < every) return token
      const m = await mintOperatorToken({ ...input, now })
      token = m.token
      jti = m.jti
      mintedAt = t
      return token
    },
  }
}

export function newSwitchJti(): string {
  return `sw_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}
