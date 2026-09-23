/**
 * Test support (p77 STORY-003): a REAL loopback Connect IdP on `node:http`.
 *
 * Serves discovery, JWKS, RFC 7662 introspection, the refresh exchange, the
 * D24 `account-version` lookup and the D26 `maintenance` route, with real
 * RSA keys (`node:crypto`) and programmable answers per test. Nothing is
 * mocked at the module level: the code under test does real HTTP.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto'
import type { AddressInfo } from 'node:net'

export interface SigningKey {
  kid: string
  privateKey: KeyObject
  publicJwk: Record<string, unknown>
}

export function makeRsaKey(kid: string): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>
  return { kid, privateKey, publicJwk: { ...jwk, kid, use: 'sig', alg: 'RS256' } }
}

const b64 = (v: Buffer | string) => Buffer.from(v).toString('base64url')

export function signJwt(
  key: SigningKey,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const h = b64(JSON.stringify({ alg: 'RS256', kid: key.kid, ...header }))
  const p = b64(JSON.stringify(claims))
  const sig = cryptoSign('sha256', Buffer.from(`${h}.${p}`, 'ascii'), key.privateKey)
  return `${h}.${p}.${b64(sig)}`
}

export interface IntrospectAnswer {
  active: boolean
  sub?: string
  cv?: number
  aeid?: string
  grant_id?: string
  exp?: number
  client_id?: string
}

export interface AccountVersionAnswerWire {
  found: boolean
  cv?: number | null
  active?: boolean | null
  epoch?: string
  grant?: string
}

export interface MaintenanceAnswer {
  status: number
  body?: unknown
  /** Send a raw non-JSON body. */
  raw?: string
}

export interface FakeIdp {
  issuer: string
  key: SigningKey
  server: Server
  close(): Promise<void>
  /** Counters, by route. */
  hits: { discovery: number; jwks: number; introspect: number; token: number; accountVersion: number; maintenance: number }
  /** Every introspected token, in order. */
  introspected: string[]
  /** Every refresh token presented, in order. */
  refreshed: string[]
  /** The bodies posted to account-version, in order. */
  accountVersionBodies: Array<Record<string, unknown>>
  /** Programmable state. */
  state: {
    /** When true discovery and JWKS answer 500. */
    jwksDown: boolean
    introspect: Map<string, IntrospectAnswer>
    /** The refresh exchange: refresh token → what to issue, or 'invalid_grant'. */
    refresh: Map<string, { access_token: string; refresh_token?: string; expires_in: number } | 'invalid_grant'>
    /** Delay the refresh answer by this many ms (to widen the race window). */
    refreshDelayMs: number
    /** account-version: answer by `${sub}|${sourceUserRef}` or the wildcard '*'; a number = answer that HTTP status. */
    accountVersion: Map<string, AccountVersionAnswerWire | number>
    maintenance: MaintenanceAnswer
    /** Keys accepted on the internal routes. */
    rpKeys: Set<string>
    /** Basic credentials accepted on the OAuth routes. */
    clients: Map<string, string>
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

function basicOk(req: IncomingMessage, clients: Map<string, string>): boolean {
  const h = req.headers.authorization ?? ''
  if (!h.startsWith('Basic ')) return false
  const [id, secret] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':')
  return id !== undefined && clients.get(decodeURIComponent(id)) === decodeURIComponent(secret ?? '')
}

export async function startFakeIdp(opts: { clientId?: string; clientSecret?: string; rpKey?: string } = {}): Promise<FakeIdp> {
  const key = makeRsaKey('k1')
  const clientId = opts.clientId ?? 'crm'
  const clientSecret = opts.clientSecret ?? 'crm-secret'
  const idp = {
    issuer: '',
    key,
    server: undefined as unknown as Server,
    hits: { discovery: 0, jwks: 0, introspect: 0, token: 0, accountVersion: 0, maintenance: 0 },
    introspected: [] as string[],
    refreshed: [] as string[],
    accountVersionBodies: [] as Array<Record<string, unknown>>,
    state: {
      jwksDown: false,
      introspect: new Map<string, IntrospectAnswer>(),
      refresh: new Map(),
      refreshDelayMs: 0,
      accountVersion: new Map<string, AccountVersionAnswerWire | number>(),
      maintenance: { status: 200, body: { active: false, jti: null, since: null, reason: null, extendedUntil: null, firstActivationAt: null } } as MaintenanceAnswer,
      rpKeys: new Set([opts.rpKey ?? 'rp-key']),
      clients: new Map([[clientId, clientSecret]]),
    },
    close: async () => {},
  } satisfies Omit<FakeIdp, 'server' | 'close'> & { server: Server; close: () => Promise<void> }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname
    try {
      if (path === '/.well-known/openid-configuration') {
        idp.hits.discovery++
        if (idp.state.jwksDown) return json(res, 500, { error: 'down' })
        return json(res, 200, {
          issuer: idp.issuer,
          jwks_uri: `${idp.issuer}/.well-known/jwks.json`,
          token_endpoint: `${idp.issuer}/oauth/token`,
          introspection_endpoint: `${idp.issuer}/oauth/introspect`,
        })
      }
      if (path === '/.well-known/jwks.json') {
        idp.hits.jwks++
        if (idp.state.jwksDown) return json(res, 500, { error: 'down' })
        return json(res, 200, { keys: [idp.key.publicJwk] })
      }
      if (path === '/oauth/introspect' && req.method === 'POST') {
        idp.hits.introspect++
        if (!basicOk(req, idp.state.clients)) return json(res, 401, { error: 'invalid_client' })
        const form = new URLSearchParams(await readBody(req))
        const token = form.get('token') ?? ''
        idp.introspected.push(token)
        const a = idp.state.introspect.get(token)
        if (!a) return json(res, 200, { active: false })
        return json(res, 200, a)
      }
      if (path === '/oauth/token' && req.method === 'POST') {
        idp.hits.token++
        if (!basicOk(req, idp.state.clients)) return json(res, 401, { error: 'invalid_client' })
        const form = new URLSearchParams(await readBody(req))
        const rt = form.get('refresh_token') ?? ''
        idp.refreshed.push(rt)
        if (idp.state.refreshDelayMs > 0) await new Promise((r) => setTimeout(r, idp.state.refreshDelayMs))
        const a = idp.state.refresh.get(rt)
        if (!a || a === 'invalid_grant') return json(res, 400, { error: 'invalid_grant' })
        return json(res, 200, { token_type: 'Bearer', ...a })
      }
      if (path === '/api/internal/connect/account-version' && req.method === 'POST') {
        idp.hits.accountVersion++
        const k = String(req.headers['x-internal-api-key'] ?? '')
        if (!idp.state.rpKeys.has(k)) return json(res, 401, { error: 'unauthorized' })
        const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>
        idp.accountVersionBodies.push(body)
        const a = idp.state.accountVersion.get(`${body.sub}|${body.sourceUserRef}`) ?? idp.state.accountVersion.get('*')
        if (a === undefined) return json(res, 200, { found: false, cv: null, active: null, epoch: 'unknown', grant: 'unknown' })
        if (typeof a === 'number') return json(res, a, { error: 'failure' })
        return json(res, 200, a)
      }
      if (path === '/api/internal/connect/maintenance' && req.method === 'GET') {
        idp.hits.maintenance++
        const k = String(req.headers['x-internal-api-key'] ?? '')
        if (!idp.state.rpKeys.has(k)) return json(res, 401, { error: 'unauthorized' })
        const m = idp.state.maintenance
        if (m.raw !== undefined) {
          res.writeHead(m.status, { 'content-type': 'application/json' })
          return res.end(m.raw)
        }
        return json(res, m.status, m.body ?? { error: 'failure' })
      }
      json(res, 404, { error: 'not_found' })
    } catch (err) {
      json(res, 500, { error: String(err) })
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  idp.issuer = `http://127.0.0.1:${port}`
  idp.server = server
  idp.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections?.()
      server.close(() => resolve())
    })
  return idp as FakeIdp
}

/** A loopback server that refuses every connection (closed port) — a transport failure. */
export async function closedPort(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
