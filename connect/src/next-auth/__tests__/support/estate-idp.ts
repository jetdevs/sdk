/**
 * Test support (p77 STORY-005): ONE loopback IdP for the estate tests —
 * discovery + JWKS (real RSA keys), the D26 `maintenance` route served from
 * a mutable switch row (the `MaintenanceSwitchStore` the lifter writes),
 * the D24 `account-version` lookup, and the whole handoff plane of
 * STORY-004's `FakeConnect` (classify / prepare / activate / … /
 * identity/register / email-held). Operator tokens are REAL RS256 JWTs
 * signed with the IdP's key; the handoff plane compares their `jti` claim
 * to the switch row's, so a rotation is refused `403 operator_superseded`
 * exactly as Connect does in-process (D23). Nothing is mocked at the
 * module level: the code under test does real HTTP.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { RpSystem } from '../../../adapter/index.js'
import type { ConnectEnv, HandoffOp } from '../../internal-routes.js'
import { OPERATOR_TOKEN_TYP } from '../../../server/revocation/operator-token.js'
import { makeRsaKey, signJwt, type AccountVersionAnswerWire, type SigningKey } from '../../../server/revocation/__tests__/support/fake-idp.js'
import { FakeConnect } from '../../../server/handoff/__tests__/support/fake-connect.js'
import { OFF_SWITCH_ROW, type MaintenanceSwitchRow, type MaintenanceSwitchStore, type OperatorTokenClaims, type OperatorTokenSigner } from '../../../cutover/switch.js'

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export function decodeJwtPayload(raw: string): Record<string, any> | null {
  try {
    const p = raw.split('.')[1]
    return p ? (JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Record<string, any>) : null
  } catch {
    return null
  }
}

export class FakeEstateIdp {
  readonly key: SigningKey = makeRsaKey('k1')
  readonly connect = new FakeConnect()
  issuer = ''
  /** The switch row — what STORY-036 keeps in `system_config`. null = absent = off. */
  switchRow: MaintenanceSwitchRow | null = null
  /** Every write to the row, in order (proves "rotate first"). */
  switchWrites: MaintenanceSwitchRow[] = []
  readonly store: MaintenanceSwitchStore = {
    read: async () => (this.switchRow ? { ...this.switchRow, extensions: [...this.switchRow.extensions] } : null),
    write: async (row) => {
      this.switchRow = { ...row, extensions: [...row.extensions] }
      this.switchWrites.push({ ...row, extensions: [...row.extensions] })
      this.syncConnect()
    },
  }
  /** Maintenance route behaviour overrides: a status to answer instead of the row (404 = an IdP without the route). */
  maintenanceStatusOverride: number | null = null
  maintenanceHits = 0
  accountVersion = new Map<string, AccountVersionAnswerWire | number>()
  accountVersionBodies: Array<Record<string, unknown>> = []
  accountVersionHits = 0
  jwksDown = false
  private server: Server | null = null

  get rpKey(): string {
    return this.connect.rpKey
  }

  /** Keep the handoff plane's jti check in step with the row (Connect checks in-process). */
  private syncConnect(): void {
    this.connect.jti = this.switchRow?.active ? this.switchRow.jti : null
  }

  readonly sign: OperatorTokenSigner = async (claims, header) => signJwt(this.key, { ...claims }, { typ: header.typ, alg: header.alg })

  /** Mint a token the way the IdP would — from the row's jti (or an explicit one, to forge "an old token"). */
  async mint(input: { ops: HandoffOp[]; env?: ConnectEnv; aud?: RpSystem[]; jti?: string; iat?: number; expSeconds?: number; typ?: string; key?: SigningKey }): Promise<string> {
    const iat = input.iat ?? Math.floor(Date.now() / 1000)
    const claims: OperatorTokenClaims = {
      iss: this.issuer,
      aud: input.aud ?? ['crm', 'yobo', 'commerce', 'superhost'],
      jti: input.jti ?? this.switchRow?.jti ?? 'no-switch',
      env: input.env ?? 'local',
      ops: input.ops,
      iat,
      exp: iat + (input.expSeconds ?? 900),
    }
    return signJwt(input.key ?? this.key, { ...claims }, { typ: input.typ ?? OPERATOR_TOKEN_TYP, alg: 'RS256' })
  }

  /** Arm the row directly (what `EstateMaintenance.arm` does after its probes), for tests of the route contract. */
  async arm(jti = 'J1'): Promise<void> {
    await this.store.write({ ...OFF_SWITCH_ROW, active: true, jti, since: new Date().toISOString(), reason: 'test', operator: 'test' })
  }

  async start(): Promise<string> {
    this.connect.operatorJtiOf = (raw) => decodeJwtPayload(raw)?.jti ?? null
    this.connect.onActivated = () => {
      if (this.switchRow?.active && !this.switchRow.firstActivationAt) {
        this.switchRow = { ...this.switchRow, firstActivationAt: new Date().toISOString() }
      }
    }
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    const { port } = this.server!.address() as AddressInfo
    this.issuer = `http://127.0.0.1:${port}`
    this.connect.issuer = this.issuer
    return this.issuer
  }

  async stop(): Promise<void> {
    if (!this.server) return
    this.server.closeAllConnections?.()
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = null
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname
    if (path === '/.well-known/openid-configuration') {
      if (this.jwksDown) return json(res, 500, { error: 'down' })
      return json(res, 200, { issuer: this.issuer, jwks_uri: `${this.issuer}/.well-known/jwks.json`, token_endpoint: `${this.issuer}/oauth/token`, introspection_endpoint: `${this.issuer}/oauth/introspect` })
    }
    if (path === '/.well-known/jwks.json') {
      if (this.jwksDown) return json(res, 500, { error: 'down' })
      return json(res, 200, { keys: [this.key.publicJwk] })
    }
    if (path === '/api/internal/connect/maintenance' && req.method === 'GET') {
      this.maintenanceHits += 1
      if (req.headers['x-internal-api-key'] !== this.rpKey) return json(res, 401, { error: 'unauthorized' })
      if (this.maintenanceStatusOverride !== null) return json(res, this.maintenanceStatusOverride, { error: 'override' })
      const r = this.switchRow ?? OFF_SWITCH_ROW
      return json(res, 200, { active: r.active, jti: r.jti, since: r.since, reason: r.reason, extendedUntil: r.extendedUntil, firstActivationAt: r.firstActivationAt })
    }
    if (path === '/api/internal/connect/account-version' && req.method === 'POST') {
      this.accountVersionHits += 1
      if (req.headers['x-internal-api-key'] !== this.rpKey) return json(res, 401, { error: 'unauthorized' })
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
      this.accountVersionBodies.push(body)
      const a = this.accountVersion.get(`${body.sub}|${body.sourceUserRef}`) ?? this.accountVersion.get('*')
      if (a === undefined) return json(res, 200, { found: false, cv: null, active: null, epoch: 'unknown', grant: 'unknown' })
      if (typeof a === 'number') return json(res, a, { error: 'failure' })
      return json(res, 200, a)
    }
    // Everything else is the handoff plane.
    return this.connect.handleRequest(req, res)
  }
}

export async function startFakeEstateIdp(): Promise<FakeEstateIdp> {
  const idp = new FakeEstateIdp()
  await idp.start()
  return idp
}
