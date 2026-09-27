/**
 * Test support (p77 STORY-004): an in-memory `RpAdapter` that satisfies the
 * REAL interface and mimics the database rules the RP migrations enforce:
 *
 *   - M5's transition trigger: `prepared → fenced` is refused while
 *     `prepare_acked_at IS NULL`; only §6.2 moves are legal;
 *   - the §6.2 authority machine (`canTransition`-shaped), `connect` terminal;
 *   - `credential_handoff_open_user_uq`: one open row per user (a second
 *     `insert` throws a 23505);
 *   - the per-class fence rule of §6.2 under "the users row lock" — a row a
 *     step holds (`held`) answers `in_flight`, exactly as `FOR UPDATE NOWAIT`
 *     would, and `listDue` skips it (SKIP LOCKED);
 *   - the operator lease (§6.5 step 0): every write first checks
 *     `lease.alive`; a drained lease throws `OperatorLeaseExpiredError`, and
 *     the write does not happen.
 *
 * `writes` counts every mutating adapter call that got past the lease, so a
 * test can assert "the fake adapter saw no write".
 */
import { randomUUID } from 'node:crypto'

import { BCRYPT_VERIFIER_RE, digestVerifier } from '../../driver.js'
import { OperatorLeaseExpiredError } from '../../lease.js'
import { sweepMappings } from '../../sweep.js'
import type { HandoffTransport } from '../../transport.js'
import type {
  AuthorityRow,
  FenceResult,
  HandoffClass,
  HandoffRow,
  HandoffState,
  HandoffTableAccess,
  LocalCredentialRead,
  RpAdapter,
  RpCredentialAuthority,
  RpState,
  RpSystem,
  RpUserInventoryRow,
} from '../../../../adapter/index.js'

export interface FakeUser {
  id: number
  email: string | null
  password: string | null
  updatedAt: string
  authority: RpCredentialAuthority
  credentialVersion: number
  connectIssuer: string | null
  connectSub: string | null
  connectMappedAt: string | null
  isActive: boolean
}

const AUTHORITY_MOVES: Record<RpCredentialAuthority, RpCredentialAuthority[]> = {
  local: ['prepared', 'connect'],
  prepared: ['fenced', 'local'],
  fenced: ['connect', 'local'],
  connect: [],
}

const STATE_MOVES: Record<HandoffState, HandoffState[]> = {
  prepared: ['fenced', 'failed'],
  fenced: ['activated', 'failed'],
  activated: [],
  failed: [],
}

/** A bcrypt-shaped verifier derived from a seed (never a real hash; the shape is what the RP checks). */
export function bcryptLike(seed: string): string {
  const alphabet = './ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let h = 0
  let out = ''
  for (let i = 0; i < 53; i += 1) {
    h = (h * 31 + seed.charCodeAt(i % seed.length) + i) >>> 0
    out += alphabet[h % alphabet.length]
  }
  return `$2b$10$${out}`
}

export class FakeRpAdapter implements RpAdapter {
  readonly db: unknown = null
  users = new Map<number, FakeUser>()
  rows = new Map<string, HandoffRow>()
  /** Rows a live step "holds" (the users row lock): `fence`/`release` on them answer `in_flight`, `listDue` skips them. */
  held = new Set<string>()
  lease = { alive: true }
  writes = 0
  writeLog: string[] = []
  fenceCalls = 0
  flagEnabled = false
  /** Pause inside `fence`, while the row is held. */
  onFence: ((userId: number) => Promise<void>) | null = null
  handoffTable: HandoffTableAccess

  constructor(
    readonly system: RpSystem,
    readonly issuer: string,
    readonly clock: { now: () => Date },
  ) {
    this.handoffTable = this.table()
  }

  addUser(u: Partial<FakeUser> & { id: number }): FakeUser {
    const user: FakeUser = {
      email: `u${u.id}@example.test`,
      password: null,
      updatedAt: this.clock.now().toISOString(),
      authority: 'local',
      credentialVersion: 1,
      connectIssuer: this.issuer,
      connectSub: null,
      connectMappedAt: null,
      isActive: true,
      ...u,
    }
    this.users.set(user.id, user)
    return user
  }

  /** A local password change (what a user or admin does while `prepared`). */
  setLocalPassword(userId: number, password: string | null): void {
    const u = this.mustUser(userId)
    u.password = password
    u.updatedAt = new Date(this.clock.now().getTime() + 1).toISOString()
  }

  openRow(userId: number): HandoffRow | null {
    return [...this.rows.values()].find((r) => r.localUserId === userId && (r.state === 'prepared' || r.state === 'fenced')) ?? null
  }

  private mustUser(userId: number): FakeUser {
    const u = this.users.get(userId)
    if (!u) throw new Error(`fake adapter: no user ${userId}`)
    return u
  }

  private write(what: string): void {
    if (!this.lease.alive) throw new OperatorLeaseExpiredError('fake-op', 'drained')
    this.writes += 1
    this.writeLog.push(what)
  }

  private moveAuthority(u: FakeUser, to: RpCredentialAuthority): void {
    if (u.authority === to) return
    if (!AUTHORITY_MOVES[u.authority].includes(to)) {
      throw Object.assign(new Error(`credential_authority transition refused for user ${u.id}: ${u.authority} → ${to} — not a p77 §6.2 transition`), { code: '23000' })
    }
    u.authority = to
  }

  // ---- reads -------------------------------------------------------------

  async readAuthority(userId: number): Promise<AuthorityRow> {
    const u = this.mustUser(userId)
    return { authority: u.authority, version: u.credentialVersion, passwordIsNull: u.password == null, issuer: u.connectIssuer, sub: u.connectSub }
  }

  async readLocalCredential(userId: number): Promise<LocalCredentialRead | null> {
    const u = this.users.get(userId)
    if (!u) return null
    const verifier = u.password && BCRYPT_VERIFIER_RE.test(u.password) ? u.password : null
    return { verifier, digest: verifier ? digestVerifier(verifier) : null, revision: u.updatedAt, authority: u.authority }
  }

  async *inventory(): AsyncIterable<RpUserInventoryRow> {
    for (const u of this.users.values()) {
      yield {
        id: u.id,
        uuid: null,
        email: u.email?.toLowerCase() ?? null,
        passwordDigest: u.password ? digestVerifier(u.password) : null,
        passwordRevision: u.updatedAt,
        isActive: u.isActive,
        credentialAuthority: u.authority,
        credentialVersion: u.credentialVersion,
        connectIssuer: u.connectIssuer,
        connectSub: u.connectSub,
        connectMappedAt: u.connectMappedAt,
        googleLinks: [],
        orgMemberships: [],
      }
    }
  }

  isSystemIdentity(row: RpUserInventoryRow): boolean {
    return !!row.email && row.email.endsWith('.invalid')
  }

  async state(): Promise<RpState> {
    const all = [...this.users.values()]
    const open = [...this.rows.values()].filter((r) => r.state === 'prepared' || r.state === 'fenced')
    return {
      system: this.system,
      schemaTag: 'fake',
      flagEnabled: this.flagEnabled,
      counts: {
        eligibleLocal: all.filter((u) => u.authority === 'local' && u.email != null).length,
        prepared: all.filter((u) => u.authority === 'prepared').length,
        fenced: all.filter((u) => u.authority === 'fenced').length,
        connect: all.filter((u) => u.authority === 'connect').length,
        system: 0,
        phoneOnly: all.filter((u) => u.email == null).length,
        inFlightOps: this.lease.alive ? 1 : 0,
      },
      openHandoffs: open.length,
    }
  }

  async drain(): Promise<{ expired: number }> {
    const was = this.lease.alive
    this.lease.alive = false
    return { expired: was ? 1 : 0 }
  }

  // ---- the moves ----------------------------------------------------------

  async fence(userId: number, expected: { digest?: string; revision?: string }): Promise<FenceResult> {
    this.fenceCalls += 1
    this.write(`fence:${userId}`)
    const u = this.mustUser(userId)
    const row = this.openRow(userId)
    if (!row) return { outcome: 'refused', reason: 'no_handoff', handoffId: null }
    if (this.held.has(row.handoffId)) return { outcome: 'refused', reason: 'in_flight', handoffId: row.handoffId }
    if (!row.prepareAckedAt) return { outcome: 'refused', reason: 'not_acked', handoffId: row.handoffId }
    if (row.state !== 'prepared' && row.state !== 'fenced') return { outcome: 'refused', reason: 'wrong_state', handoffId: row.handoffId }
    const verifier = u.password && BCRYPT_VERIFIER_RE.test(u.password) ? u.password : null
    const digest = verifier ? digestVerifier(verifier) : null
    switch (row.handoffClass) {
      case 'import':
        if (!verifier) return { outcome: 'refused', reason: 'verifier_missing', handoffId: row.handoffId }
        break // digest drift is re-pinned by the driver from the digest answered below
      case 'adopt':
      case 'retire':
        if ((expected.digest ?? null) !== digest || (expected.revision ?? null) !== u.updatedAt) {
          return { outcome: 'refused', reason: 'adopt_source_changed', handoffId: row.handoffId }
        }
        break
      case 'recover':
        if (verifier) return { outcome: 'refused', reason: 'local_verifier_appeared', handoffId: row.handoffId }
        break
    }
    this.held.add(row.handoffId)
    try {
      if (this.onFence) await this.onFence(userId)
      this.moveAuthority(u, 'fenced')
      if (row.state === 'prepared') {
        row.state = 'fenced'
        row.fencedAt = this.clock.now().toISOString()
      }
    } finally {
      this.held.delete(row.handoffId)
    }
    return { outcome: 'fenced', handoffId: row.handoffId, handoffClass: row.handoffClass, digest, revision: u.updatedAt }
  }

  async flipToConnect(userId: number, connectCv: number): Promise<void> {
    this.write(`flip:${userId}`)
    const u = this.mustUser(userId)
    if (u.authority !== 'connect') {
      this.moveAuthority(u, 'connect')
      u.credentialVersion = connectCv
    }
    u.password = null
  }

  async release(userId: number): Promise<'released' | 'no_handoff'> {
    this.write(`release:${userId}`)
    const u = this.mustUser(userId)
    const row = this.openRow(userId)
    if (!row) return 'no_handoff'
    if (this.held.has(row.handoffId)) throw Object.assign(new Error('could not obtain lock on row in relation "users"'), { code: '55P03' })
    if (u.authority === 'prepared' || u.authority === 'fenced') this.moveAuthority(u, 'local')
    row.state = 'failed'
    row.failedReason = row.failRequestedReason ?? 'released'
    return 'released'
  }

  async invalidateLocalSessions(): Promise<void> {}
  async stampIssuer(userIds: number[]): Promise<number> {
    this.write('stampIssuer')
    return userIds.length
  }
  async quarantineBinding(): Promise<void> {
    this.write('quarantine')
  }
  async retireEmail(): Promise<'retired' | 'already_retired'> {
    this.write('retireEmail')
    return 'retired'
  }
  async deactivate(userId: number): Promise<void> {
    this.write(`deactivate:${userId}`)
    this.mustUser(userId).isActive = false
  }

  async unmappedBindings(limit: number): Promise<Array<{ userId: number; sub: string }>> {
    return [...this.users.values()]
      .filter((u) => u.connectSub != null && u.connectMappedAt == null)
      .slice(0, limit)
      .map((u) => ({ userId: u.id, sub: u.connectSub! }))
  }

  async markMapped(userId: number): Promise<void> {
    this.write(`markMapped:${userId}`)
    this.mustUser(userId).connectMappedAt = this.clock.now().toISOString()
  }

  /** The RP's `sweep-mappings` op: the library function over this adapter. Needs a transport. */
  transportForSweep: HandoffTransport | null = null
  async sweepMappings(limit: number): Promise<{ registered: number; conflicts: number }> {
    if (!this.transportForSweep) throw new Error('fake adapter: transportForSweep not set')
    const r = await sweepMappings({ adapter: this, transport: this.transportForSweep, limit })
    return { registered: r.registered, conflicts: r.conflicts }
  }

  // ---- credential_handoff -------------------------------------------------

  private table(): HandoffTableAccess {
    const self = this
    const copy = (r: HandoffRow): HandoffRow => ({ ...r })
    return {
      async readHandoff(handoffId) {
        const r = self.rows.get(handoffId)
        return r ? copy(r) : null
      },
      async readOpenHandoffForUser(userId) {
        const r = self.openRow(userId)
        return r ? copy(r) : null
      },
      async listDue(limit) {
        const due = self.clock.now().getTime()
        return [...self.rows.values()]
          .filter((r) => (r.state === 'prepared' || r.state === 'fenced') && new Date(r.nextAttemptAt).getTime() <= due && !self.held.has(r.handoffId))
          .sort((a, b) => a.preparedAt.localeCompare(b.preparedAt))
          .slice(0, limit)
          .map(copy)
      },
      async insert(input) {
        self.write(`insert:${input.localUserId}`)
        const u = self.mustUser(input.localUserId)
        if (self.openRow(input.localUserId)) {
          throw Object.assign(new Error('duplicate key value violates unique constraint "credential_handoff_open_user_uq"'), { code: '23505' })
        }
        self.moveAuthority(u, 'prepared')
        const now = self.clock.now().toISOString()
        const row: HandoffRow = {
          handoffId: randomUUID(),
          connectIssuer: input.connectIssuer,
          connectSub: input.connectSub,
          localUserId: input.localUserId,
          state: 'prepared',
          handoffClass: input.handoffClass,
          sourceDigest: input.sourceDigest,
          sourceRevision: input.sourceRevision,
          expectedLocalDigest: input.expectedLocalDigest,
          expectedLocalRevision: input.expectedLocalRevision,
          preparedAt: now,
          prepareAckedAt: null,
          fencedAt: null,
          activatedAt: null,
          failedReason: null,
          failRequestedAt: null,
          failRequestedReason: null,
          attempts: 0,
          nextAttemptAt: now,
          lastError: null,
          lastOutcome: null,
        }
        self.rows.set(row.handoffId, row)
        return copy(row)
      },
      async transition(handoffId, to, patch = {}) {
        self.write(`transition:${handoffId.slice(0, 8)}:${to}`)
        const row = self.rows.get(handoffId)
        if (!row) throw new Error(`handoff ${handoffId} vanished`)
        if (to !== row.state) {
          if (!STATE_MOVES[row.state].includes(to)) {
            throw Object.assign(new Error(`credential_handoff transition refused: ${row.state} → ${to}`), { code: '23000' })
          }
          if (row.state === 'prepared' && to === 'fenced' && !(row.prepareAckedAt || patch.prepareAckedAt)) {
            throw Object.assign(new Error('credential_handoff transition refused: prepared → fenced while prepare_acked_at IS NULL (M5)'), { code: '23000' })
          }
          row.state = to
          const at = self.clock.now().toISOString()
          if (to === 'fenced') row.fencedAt = at
          if (to === 'activated') row.activatedAt = at
        }
        if (patch.nextAttemptAt !== undefined && patch.nextAttemptAt !== row.nextAttemptAt) row.attempts += 1
        Object.assign(row, patch)
        return copy(row)
      },
    }
  }
}

export type HandoffClassName = HandoffClass
