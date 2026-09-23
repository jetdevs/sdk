/**
 * Test support (p77 STORY-004): a REAL loopback Connect handoff plane on
 * `node:http` — the receivers STORY-008/010 will build, modelled on the
 * contract pinned in `../../transport.ts`.
 *
 * It keeps Connect's side of the protocol as state: canonical users, the
 * `rp_identity_map`, `staged_verifiers` (one row per user), the per
 * `(source_system, source_user_ref)` receipts, and the D10 ORDERED class
 * rule as ONE function (`classRule`) that classify, prepare and every re-post
 * apply. Nothing is mocked at the module level: the code under test does real
 * HTTP.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { HandoffClass } from '../../../../adapter/index.js'

export interface CanonicalUser {
  id: number
  password: string | null
  credentialVersion: number
  googleLinked: boolean
  active: boolean
}

export interface Receipt {
  system: string
  ref: string
  userId: number
  handoffId: string
  handoffClass: HandoffClass
  state: 'prepared' | 'activated' | 'failed'
  /** The activation that established the canonical verifier (an `import`). */
  established: boolean
}

export interface StagedRow {
  userId: number
  system: string
  ref: string
  verifier: string
  revision: string
  handoffId: string
}

export interface RequestRecord {
  route: string
  system: string | null
  operator: string | null
  body: any
  status: number
}

export class FakeConnect {
  users = new Map<number, CanonicalUser>()
  /** `system:ref` → canonical user id (rp_identity_map). */
  map = new Map<string, number>()
  staged = new Map<number, StagedRow>()
  /** Every verifier that was ever staged, in order (proves "the staging transport never saw B"). */
  stagedHistory: string[] = []
  receipts = new Map<string, Receipt>()
  emailsHeld = new Set<string>()
  resetForwards: string[] = []
  resetForwardStatus = 200
  registerStatusOverride: number | null = null
  /** The switch's current jti; a request carrying another one is `403 operator_superseded`. null = off (no check). */
  jti: string | null = null
  /** Routes answered 503 until removed. */
  withhold = new Set<string>()
  hits: Record<string, number> = {}
  requests: RequestRecord[] = []
  readonly rpKey = 'rp-key'
  private server: Server | null = null
  issuer = ''

  addUser(u: Partial<CanonicalUser> & { id: number }): CanonicalUser {
    const user: CanonicalUser = { password: null, credentialVersion: 1, googleLinked: false, active: true, ...u }
    this.users.set(user.id, user)
    return user
  }

  bind(system: string, ref: string, userId: number): void {
    this.map.set(`${system}:${ref}`, userId)
  }

  receipt(system: string, ref: string): Receipt | undefined {
    return this.receipts.get(`${system}:${ref}`)
  }

  /** D10's ordered first-come rule; the caller's OWN staging/receipt does not count as "exists for the user". */
  classRule(user: CanonicalUser, hasVerifier: boolean, caller: { system: string; ref: string }): HandoffClass {
    const stagedElsewhere = (() => {
      const s = this.staged.get(user.id)
      return !!s && !(s.system === caller.system && s.ref === caller.ref)
    })()
    const establishedElsewhere = [...this.receipts.values()].some(
      (r) => r.userId === user.id && r.established && r.state === 'activated' && !(r.system === caller.system && r.ref === caller.ref),
    )
    if (hasVerifier && (stagedElsewhere || establishedElsewhere)) return 'retire'
    if (user.password != null) return 'adopt'
    if (hasVerifier) return 'import'
    return 'recover'
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res))
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    const { port } = this.server!.address() as AddressInfo
    this.issuer = `http://127.0.0.1:${port}`
    return this.issuer
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => this.server!.close(() => resolve()))
    this.server = null
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://x')
    const route = url.pathname.replace(/^\/api\/internal\/connect\//, '')
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    let body: any = null
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
    } catch {
      body = null
    }
    const system = (req.headers['x-service-name'] as string | undefined) ?? null
    const operator = (req.headers['x-cutover-operator'] as string | undefined) ?? null
    this.hits[route] = (this.hits[route] ?? 0) + 1
    const record: RequestRecord = { route, system, operator, body, status: 0 }
    this.requests.push(record)
    const answer = (status: number, json: unknown) => {
      record.status = status
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(json))
    }
    if (req.headers['x-internal-api-key'] !== this.rpKey) return answer(401, { error: 'unauthorized' })
    if (this.withhold.has(route)) return answer(503, { error: 'withheld' })
    if (route.startsWith('handoff/') && operator !== null && this.jti !== null && operator !== this.jti) {
      return answer(403, { error: 'operator_superseded' })
    }
    const caller = { system: system ?? '?', ref: String(body?.sourceUserRef ?? '') }
    const key = `${caller.system}:${caller.ref}`
    const user = (): CanonicalUser | undefined => {
      const id = this.map.get(key)
      return id == null ? undefined : this.users.get(id)
    }

    switch (route) {
      case 'handoff/classify': {
        const u = user()
        if (!u) return answer(404, { error: 'subject_not_mapped' })
        const cls = this.classRule(u, !!body.hasVerifier, caller)
        if (body.expectedClass && body.expectedClass !== cls) return answer(409, { error: 'class_mismatch', handoffClass: cls })
        return answer(200, { handoffClass: cls })
      }
      case 'handoff/prepare': {
        const u = user()
        if (!u) return answer(404, { error: 'subject_not_mapped' })
        const existing = this.receipts.get(key)
        if (existing && existing.handoffId === body.handoffId) {
          if (existing.state === 'activated') return answer(409, { error: 'already_activated' })
          if (existing.state === 'failed') return answer(409, { error: 'handoff_failed' })
        }
        const cls = this.classRule(u, !!body.hasVerifier, caller)
        if (cls !== body.handoffClass) return answer(409, { error: 'class_changed', handoffClass: cls })
        let outcome: 'staged' | 'restaged' | 'recorded' = 'recorded'
        if (cls === 'import') {
          if (!body.source?.verifier) return answer(400, { error: 'source_required' })
          const s = this.staged.get(u.id)
          if (s && !(s.system === caller.system && s.ref === caller.ref)) return answer(409, { error: 'staged_verifier_present' })
          if (s && s.verifier === body.source.verifier) outcome = 'staged'
          else {
            outcome = s ? 'restaged' : 'staged'
            this.staged.set(u.id, { userId: u.id, system: caller.system, ref: caller.ref, verifier: body.source.verifier, revision: body.source.revision, handoffId: body.handoffId })
            this.stagedHistory.push(body.source.verifier)
          }
        }
        this.receipts.set(key, { system: caller.system, ref: caller.ref, userId: u.id, handoffId: body.handoffId, handoffClass: cls, state: 'prepared', established: false })
        return answer(200, { outcome, handoffClass: cls })
      }
      case 'handoff/activate': {
        const u = user()
        if (!u) return answer(404, { error: 'subject_not_mapped' })
        const r = this.receipts.get(key)
        if (!r) return answer(200, { outcome: 'not_staged' })
        if (r.state === 'failed') return answer(409, { error: 'handoff_failed' })
        if (r.state === 'activated') return answer(200, { outcome: 'already_activated', credentialVersion: u.credentialVersion })
        if (r.handoffClass !== 'import') return answer(409, { error: 'not_import' })
        const s = this.staged.get(u.id)
        if (!s || s.system !== caller.system || s.ref !== caller.ref) return answer(200, { outcome: 'not_staged' })
        if (s.verifier !== body.source?.verifier) {
          this.staged.set(u.id, { ...s, verifier: body.source.verifier, revision: body.source.revision })
          this.stagedHistory.push(body.source.verifier)
          return answer(200, { outcome: 'restaged' })
        }
        u.password = s.verifier
        u.credentialVersion += 1
        this.staged.delete(u.id)
        r.state = 'activated'
        r.established = true
        return answer(200, { outcome: 'activated', credentialVersion: u.credentialVersion })
      }
      case 'handoff/activate-existing': {
        const u = user()
        if (!u) return answer(404, { error: 'subject_not_mapped' })
        const r = this.receipts.get(key)
        if (!r) return answer(404, { error: 'no_receipt' })
        if (r.state === 'failed') return answer(409, { error: 'handoff_failed' })
        if (r.state === 'activated') return answer(200, { outcome: 'already_activated', credentialVersion: u.credentialVersion })
        if (r.handoffClass === 'import') return answer(409, { error: 'staged_verifier_present' })
        if (r.handoffClass === 'retire' && u.password == null) return answer(409, { error: 'canonical_pending' })
        if (r.handoffClass === 'recover' && u.password == null && !u.googleLinked) return answer(200, { outcome: 'no_connect_credential_yet' })
        r.state = 'activated'
        const via = r.handoffClass === 'recover' ? (u.password != null ? 'password' : 'google') : 'retired'
        return answer(200, { outcome: 'activated', via, credentialVersion: u.credentialVersion })
      }
      case 'handoff/fail': {
        const u = user()
        if (!u) return answer(404, { error: 'subject_not_mapped' })
        const r = this.receipts.get(key)
        if (!r) return answer(200, { outcome: 'nothing_to_fail' })
        if (body.handoffId && body.handoffId !== r.handoffId) return answer(409, { error: 'handoff_mismatch' })
        if (r.state === 'activated') return answer(409, { error: 'already_activated' })
        if (r.state === 'failed') return answer(200, { outcome: 'already_failed' })
        r.state = 'failed'
        const s = this.staged.get(u.id)
        if (s && s.system === caller.system && s.ref === caller.ref) this.staged.delete(u.id)
        return answer(200, { outcome: 'failed' })
      }
      case 'handoff/state': {
        const u = user()
        if (!u) return answer(200, { found: false })
        const r = this.receipts.get(key)
        return answer(200, { found: true, userId: u.id, credentialVersion: u.credentialVersion, handoffId: r?.handoffId, handoffClass: r?.handoffClass, state: r?.state })
      }
      case 'identity/register': {
        if (this.registerStatusOverride != null) return answer(this.registerStatusOverride, { error: 'override' })
        const id = Number(body?.sub)
        const u = this.users.get(id)
        if (!u) return answer(404, { error: 'subject_unknown' })
        if (!u.active) return answer(409, { error: 'subject_inactive' })
        const cur = this.map.get(key)
        if (cur != null && cur !== id) return answer(409, { error: 'ref_conflict' })
        this.map.set(key, id)
        return answer(200, { ok: true })
      }
      case 'email-held':
        return answer(200, { held: this.emailsHeld.has(String(body?.email ?? '').toLowerCase()) })
      case 'reset-forward':
        this.resetForwards.push(String(body?.email ?? ''))
        return answer(this.resetForwardStatus, this.resetForwardStatus === 200 ? { ok: true } : { error: 'maintenance' })
      default:
        return answer(404, { error: 'not_found' })
    }
  }
}

export async function startFakeConnect(): Promise<FakeConnect> {
  const fc = new FakeConnect()
  await fc.start()
  return fc
}
