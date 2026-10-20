// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  ConnectProvisioningClient,
  ConnectOnboardingIdentityError,
  isConnectOnboardingIdentityError,
  type ConnectProvisioningConfig,
  type PrepareOnboardingIdentityArgs,
  type ExchangeOnboardingIdentityArgs,
} from '../index.js'

const prepare = { state: 's'.repeat(32), nonce: 'n'.repeat(32), codeChallenge: 'c'.repeat(43) }
const exchange = {
  code: 'a'.repeat(64), codeVerifier: 'v'.repeat(43), nonce: prepare.nonce, state: prepare.state,
  redirectUri: 'https://merchant.example/api/signup/connect/callback',
}
const seen: { path?: string; headers: http.IncomingHttpHeaders; body: unknown; method?: string }[] = []
let next: { status: number; body: string; delayMs?: number; bodyDelayMs?: number }
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    seen.push({ path: req.url, method: req.method, headers: req.headers, body: JSON.parse(raw) })
    const answer = next
    setTimeout(() => {
      res.writeHead(answer.status, { 'Content-Type': 'application/json' })
      if (answer.bodyDelayMs) {
        res.flushHeaders()
        setTimeout(() => res.end(answer.body), answer.bodyDelayMs)
      } else res.end(answer.body)
    }, answer.delayMs ?? 0)
  })
})
let baseUrl: string
const required = () => ({ kind: 'required', authorizationUrl: `${baseUrl}/api/connect/onboarding/authorize?request=opaque-handle`, expiresIn: 600 })
const identity = () => ({ issuer: baseUrl, sub: '42', email: 'user@example.com', emailVerified: true, name: 'User', nonce: prepare.nonce, state: prepare.state, clientId: 'merchant-client' })
const client = (config: Partial<ConnectProvisioningConfig> = {}) => new ConnectProvisioningClient({ baseUrl: `${baseUrl}/`, internalApiKey: 'rp-key', ...config })
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(() => {
  seen.length = 0
  next = { status: 200, body: JSON.stringify(required()) }
})

describe('restricted onboarding identity transport', () => {
  it('prepares with explicit fields and only RP authentication', async () => {
    const args = { ...prepare, expectedEmail: 'user@example.com', method: 'google' as const, preflight: true, password: 'secret', clientId: 'untrusted', redirectUri: 'https://evil.example' }
    await expect(client().prepareOnboardingIdentity(args)).resolves.toEqual(required())
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/api/internal/connect/onboarding/prepare', headers: { 'x-internal-api-key': 'rp-key', 'content-type': 'application/json', accept: 'application/json' }, body: { ...prepare, expectedEmail: 'user@example.com', method: 'google', preflight: true } })
    expect(seen[0].headers.authorization).toBeUndefined()
    expect(seen[0].headers['x-cutover-operator']).toBeUndefined()
  })

  it('accepts not_required only for explicitly requested preflight', async () => {
    next.body = JSON.stringify({ kind: 'not_required', access_token: 'discard' })
    await expect(client().prepareOnboardingIdentity({ ...prepare, expectedEmail: 'user@example.com', preflight: true })).resolves.toEqual({ kind: 'not_required' })
    await expect(client().prepareOnboardingIdentity(prepare)).rejects.toMatchObject({ code: 'unexpected', status: 200 })
    await expect(client().prepareOnboardingIdentity({ ...prepare, preflight: false })).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it('matches the configured prepare origin without imposing callback URI policy on it', async () => {
    const result = { kind: 'required', authorizationUrl: 'http://connect.internal/api/connect/onboarding/authorize?request=opaque', expiresIn: 600 }
    await expect(client({ baseUrl: 'http://connect.internal', fetchImpl: async () => Response.json(result) }).prepareOnboardingIdentity(prepare)).resolves.toEqual(result)
  })

  it('exchanges only the snapshotted proof fields and returns sanitized identity fields', async () => {
    next.body = JSON.stringify({ ...identity(), access_token: 'discard', id_token: 'discard', password: 'discard', roles: ['owner'], org_id: 10 })
    const args = { ...exchange, password: 'discard', clientId: 'untrusted' }
    await expect(client().exchangeOnboardingIdentity(args)).resolves.toEqual(identity())
    expect(seen[0]).toMatchObject({ method: 'POST', path: '/api/internal/connect/onboarding/exchange', body: exchange })
  })

  it.each([false, true])('uses original nonce/state after caller mutation (mutated receipt=%s)', async (mutatedReceipt) => {
    let respond!: (response: Response) => void
    let sent: unknown
    const sdk = client({ fetchImpl: (_url, options) => { sent = JSON.parse(String(options?.body)); return new Promise<Response>((resolve) => (respond = resolve)) } })
    const args = { ...exchange }
    const pending = sdk.exchangeOnboardingIdentity(args)
    args.nonce = 'z'.repeat(32)
    args.state = 'y'.repeat(32)
    args.redirectUri = 'https://evil.example/callback'
    expect(sent).toEqual(exchange)
    respond(Response.json({ ...identity(), ...(mutatedReceipt ? { nonce: args.nonce, state: args.state } : {}) }))
    if (mutatedReceipt) await expect(pending).rejects.toMatchObject({ code: 'unexpected', status: 200 })
    else await expect(pending).resolves.toEqual(identity())
  })

  it('does not let a mutation authorize an unrequested preflight skip', async () => {
    let respond!: (response: Response) => void
    const args = { ...prepare, expectedEmail: 'user@example.com', preflight: false }
    const pending = client({ fetchImpl: () => new Promise<Response>((resolve) => (respond = resolve)) }).prepareOnboardingIdentity(args)
    args.preflight = true
    respond(Response.json({ kind: 'not_required' }))
    await expect(pending).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it.each([
    null, undefined, [], {}, Object.assign(() => {}, prepare), { ...prepare, state: 42 },
    ...['', 's'.repeat(31), 's'.repeat(129), 's'.repeat(32) + '\n', 'bad!'.repeat(8)].flatMap((value) => [{ ...prepare, state: value }, { ...prepare, nonce: value }]),
    ...['', 'c'.repeat(42), 'c'.repeat(44), 'c'.repeat(43) + '\n', 'c'.repeat(42) + '+'].map((codeChallenge) => ({ ...prepare, codeChallenge })),
    ...['', 'invalid', 'u@', 'u @example.com', 'u@example.com\n', 42, null].map((expectedEmail) => ({ ...prepare, expectedEmail })),
    { ...prepare, method: 'passwordless' }, { ...prepare, method: null }, { ...prepare, preflight: 'true' }, { ...prepare, preflight: null }, { ...prepare, preflight: true },
  ])('rejects invalid prepare input locally: %j', async (args) => {
    await expect(client().prepareOnboardingIdentity(args as PrepareOnboardingIdentityArgs)).rejects.toMatchObject({ code: 'invalid_body', status: 0 })
    expect(seen).toHaveLength(0)
  })

  it.each([
    null, undefined, [], {}, Object.assign(() => {}, exchange), { ...exchange, code: 42 },
    ...['a'.repeat(63), 'a'.repeat(65), 'g'.repeat(64), 'a'.repeat(64) + '\n'].map((code) => ({ ...exchange, code })),
    ...['v'.repeat(42), 'v'.repeat(129), 'v'.repeat(43) + '\n', '+'.repeat(43)].map((codeVerifier) => ({ ...exchange, codeVerifier })),
    { ...exchange, nonce: 'short' }, { ...exchange, state: 'short' },
    ...['/callback', 'http://merchant.example/callback', 'https://user:pass@merchant.example/callback', 'https://merchant.example/callback#fragment', 'https:merchant.example/callback', 'https://merchant.example/\u0000callback', 'javascript:evil', '', 42].map((redirectUri) => ({ ...exchange, redirectUri })),
  ])('rejects invalid exchange input locally: %j', async (args) => {
    await expect(client().exchangeOnboardingIdentity(args as ExchangeOnboardingIdentityArgs)).rejects.toMatchObject({ code: 'invalid_body', status: 0 })
    expect(seen).toHaveLength(0)
  })

  it('accepts boundary fields, localhost HTTP callback, false email verification and absent name', async () => {
    const { name: _name, ...receipt } = identity()
    next.body = JSON.stringify({ ...receipt, sub: '2147483647', emailVerified: false })
    await expect(client().exchangeOnboardingIdentity({ ...exchange, codeVerifier: 'v'.repeat(128), redirectUri: 'http://localhost:3000/callback' })).resolves.toEqual({ ...receipt, sub: '2147483647', emailVerified: false })
    next.body = JSON.stringify({ ...required(), expiresIn: 1 })
    await expect(client().prepareOnboardingIdentity({ ...prepare, state: 's'.repeat(128), nonce: 'n'.repeat(128), method: 'password' })).resolves.toMatchObject({ expiresIn: 1 })
  })

  it.each([
    null, [], 'ok', 42, {}, { kind: 'unknown' },
    ...[0, -1, 0.1, 601, '600', null, Number.MAX_SAFE_INTEGER + 1].map((expiresIn) => ({ kind: 'required', expiresIn })),
    ...['https://evil.example/api/connect/onboarding/authorize?request=x', '/api/connect/onboarding/authorize?request=x', 'https://user:pass@example.com/api/connect/onboarding/authorize?request=x'].map((authorizationUrl) => ({ kind: 'required', authorizationUrl, expiresIn: 600 })),
  ])('rejects malformed prepare success: %j', async (body) => {
    next.body = JSON.stringify(body)
    await expect(client().prepareOnboardingIdentity(prepare)).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it.each(['/wrong?request=x', '/api/connect/onboarding/authorize', '/api/connect/onboarding/authorize?request=', '/api/connect/onboarding/authorize?request=x&request=y', '/api/connect/onboarding/authorize?request=x&redirect_uri=https://evil.example', '/api/connect/onboarding/authorize?request=x#fragment'])('rejects an unsafe authorization path/query: %s', async (suffix) => {
    next.body = JSON.stringify({ ...required(), authorizationUrl: baseUrl + suffix })
    await expect(client().prepareOnboardingIdentity(prepare)).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it.each([
    ['issuer', 'https://other.example'], ['issuer', 'https://other.example/path'], ['issuer', null],
    ...['0', '-1', '+1', '01', '42\n', '1e2', '1.1', '2147483648', 42, null].map((value) => ['sub', value]),
    ...['', 'invalid', 'u @example.com', 'u@example.com\n', null, 42].map((value) => ['email', value]),
    ['emailVerified', 'true'], ['emailVerified', null], ['nonce', 'other'], ['state', 'other'], ['clientId', ' '], ['clientId', null], ['name', 42], ['name', null],
  ])('rejects invalid exchange field %s=%j', async (field, value) => {
    next.body = JSON.stringify({ ...identity(), [String(field)]: value })
    await expect(client().exchangeOnboardingIdentity(exchange)).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  for (const method of ['prepare', 'exchange'] as const) {
    const call = (sdk: ConnectProvisioningClient) => method === 'prepare' ? sdk.prepareOnboardingIdentity(prepare) : sdk.exchangeOnboardingIdentity(exchange)
    it.each(['invalid_body', 'unauthorized', 'scope_not_permitted', 'source_system_not_permitted', 'client_mismatch', 'subject_unknown', 'subject_inactive', 'email_mismatch', 'identity_changed', 'invalid_proof', 'request_expired', 'already_used', 'request_mismatch', 'maintenance', 'db_unavailable'])(`${method} preserves refusal %s without retry`, async (error) => {
      next = { status: 409, body: JSON.stringify({ error }) }
      await expect(call(client())).rejects.toMatchObject({ kind: 'connect_onboarding_identity_error', code: error, status: 409 })
      expect(seen).toHaveLength(1)
    })
    it.each([[201, '{}'], [202, '{}'], [204, ''], [200, 'not json'], [200, '{"error":"invalid_proof"}'], [409, '{"error":"other"}'], [500, '<html>error</html>']])(`${method} rejects status/body outside the contract: %s %s`, async (status, body) => {
      next = { status: Number(status), body: String(body) }
      await expect(call(client())).rejects.toMatchObject({ code: 'unexpected', status })
      expect(seen).toHaveLength(1)
    })
    it(`${method} rejects a valid body on HTTP 201`, async () => {
      next = { status: 201, body: JSON.stringify(method === 'prepare' ? required() : identity()) }
      await expect(call(client())).rejects.toMatchObject({ code: 'unexpected', status: 201 })
    })
    it(`${method} reports unreachable without retry`, async () => {
      await expect(call(client({ baseUrl: 'http://127.0.0.1:1' }))).rejects.toMatchObject({ code: 'unreachable', status: 0 })
    })
    it.each([false, true])(`${method} times out during fetch/body (body=%s)`, async (bodyDelay) => {
      next = { status: 200, body: JSON.stringify(method === 'prepare' ? required() : identity()), ...(bodyDelay ? { bodyDelayMs: 300 } : { delayMs: 300 }) }
      await expect(call(client({ onboardingTimeoutMs: 50 }))).rejects.toMatchObject({ code: 'timeout', status: bodyDelay ? 200 : 0 })
      expect(seen).toHaveLength(1)
    })
    it(`${method} uses a finite default onboarding budget independently of old budgets`, async () => {
      let signal: AbortSignal | undefined
      const pending = call(client({ registerTimeoutMs: 1, disconnectTimeoutMs: 1, fetchImpl: async (_url, options) => {
        signal = options?.signal ?? undefined
        await new Promise((resolve) => setTimeout(resolve, 20))
        return Response.json(method === 'prepare' ? required() : identity())
      } }))
      await expect(pending).resolves.toBeDefined()
      expect(signal).toBeInstanceOf(AbortSignal)
      expect(signal?.aborted).toBe(false)
    })
  }

  it('exports a stable typed error and bundle-safe guard', async () => {
    next = { status: 403, body: '{"error":"scope_not_permitted"}' }
    const error = await client().prepareOnboardingIdentity(prepare).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(ConnectOnboardingIdentityError)
    expect(isConnectOnboardingIdentityError(error)).toBe(true)
    expect(isConnectOnboardingIdentityError({ kind: 'connect_onboarding_identity_error' })).toBe(true)
    expect(isConnectOnboardingIdentityError(null)).toBe(false)
    expect(isConnectOnboardingIdentityError(new Error('other'))).toBe(false)
  })
})
