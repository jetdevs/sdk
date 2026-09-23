/**
 * Test support (p77 STORY-005): an `RpAdapter` over a REAL local Postgres
 * (scratch schema), so the lease / drain acceptance criteria run through the
 * real route with real transactions, real row locks and the real
 * `connect_operator_leases` table (M4). It is the executable shape of what
 * STORY-020/024's adapters do, reduced to the columns the driver touches:
 *
 *   - every write is one transaction on the client it was built with — the
 *     route hands it `withOperatorLease(sql, opId)`, so each transaction
 *     begins with the SET LOCALs and the lease claim (STORY-004);
 *   - `insert` = §6.2 step (2): users row `FOR UPDATE NOWAIT`, the row
 *     `prepared` with the answered class, authority local → prepared, one
 *     transaction — with a TEST HOOK awaited INSIDE that transaction after
 *     the INSERT (the AC11 pause point: the lease is claimed and the row
 *     lock is held);
 *   - `fence` / `release` take the users row lock NOWAIT (55P03 → in_flight);
 *   - the M5 rule: `prepared → fenced` refused while `prepare_acked_at IS NULL`;
 *   - one open row per user (partial unique index).
 *
 * URL: `CORE_TEST_DATABASE_URL` (default postgres://localhost:5432/core_sdk_p77_test).
 */
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

import { BCRYPT_VERIFIER_RE, digestVerifier } from '../../../server/handoff/driver.js'
import { drainLeases, OPERATOR_LEASE_DDL } from '../../../server/handoff/lease.js'
import { RECONCILER_CLAIM_SQL } from '../../../server/handoff/reconciler.js'
import { sweepMappings } from '../../../server/handoff/sweep.js'
import type { HandoffTransport } from '../../../server/handoff/transport.js'
import { sqlClientFromPostgresJs } from '../../../server/revocation/sql-client.js'
import { assertLocalUrl, LOCAL_TEST_DB_URL } from '../../../server/revocation/__tests__/support/local-db.js'
import type {
  AuthorityRow,
  FenceResult,
  HandoffRow,
  HandoffState,
  HandoffTableAccess,
  LocalCredentialRead,
  RpAdapter,
  RpCredentialAuthority,
  RpSqlClient,
  RpState,
  RpSystem,
  RpUserInventoryRow,
  SqlExecutor,
} from '../../../adapter/index.js'

const requireFromCore = createRequire(new URL('../../../../../core/package.json', import.meta.url))

export const RP_SCHEMA_DDL = `
CREATE TABLE users (
  id serial PRIMARY KEY,
  email text,
  password text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  credential_authority varchar(16) NOT NULL DEFAULT 'local',
  credential_version integer NOT NULL DEFAULT 1,
  connect_issuer text,
  connect_sub text,
  connect_mapped_at timestamptz
);
CREATE TABLE credential_handoff (
  handoff_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connect_issuer text NOT NULL,
  connect_sub text NOT NULL,
  local_user_id integer,
  state varchar(16) NOT NULL,
  handoff_class varchar(16) NOT NULL,
  source_digest text,
  source_revision text,
  expected_local_digest text,
  expected_local_revision text,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  prepare_acked_at timestamptz,
  fenced_at timestamptz,
  activated_at timestamptz,
  failed_reason text,
  fail_requested_at timestamptz,
  fail_requested_reason text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error text,
  last_outcome text
);
CREATE UNIQUE INDEX credential_handoff_open_user_uq ON credential_handoff (local_user_id) WHERE state IN ('prepared', 'fenced');
${OPERATOR_LEASE_DDL}
CREATE TABLE connect_logout_tokens (connect_issuer text NOT NULL, jti text NOT NULL, expires_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (connect_issuer, jti));
CREATE TABLE connect_session_revocations (id bigserial PRIMARY KEY, connect_issuer text NOT NULL, connect_sub text, connect_sid text, local_user_id integer, jti text NOT NULL, revoked_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_email_retirements (user_id integer PRIMARY KEY, original_email text NOT NULL, surviving_user_id integer NOT NULL, reason text NOT NULL, retired_at timestamptz NOT NULL DEFAULT now(), by text);
CREATE TABLE connect_binding_quarantine (local_user_id integer PRIMARY KEY, connect_sub text, reason text NOT NULL, quarantined_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_deactivations (user_id integer PRIMARY KEY, reason text NOT NULL, at timestamptz NOT NULL DEFAULT now());
`

export interface PgTestDb {
  schema: string
  /** A client per role (each `max: 1`: ONE Postgres session per client). */
  sql: RpSqlClient
  raw: any
  /** Open another client on the same schema — `max` sessions (default 1: ONE Postgres backend). */
  session(max?: number): { raw: any; sql: RpSqlClient }
  close(): Promise<void>
}

/** Opens a scratch schema with the RP tables; null when the local DB is unreachable (the test skips). */
export async function openPgTestDb(prefix = 'p77_rp'): Promise<PgTestDb | null> {
  const parsed = assertLocalUrl(LOCAL_TEST_DB_URL)
  console.log(`[p77 STORY-005 test] database host: ${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`)
  const postgres = requireFromCore('postgres') as (url: string, opts: Record<string, unknown>) => any
  const schema = `${prefix}_${randomBytes(4).toString('hex')}`
  const open = (max = 1) => postgres(LOCAL_TEST_DB_URL, { max, onnotice: () => {}, connect_timeout: 3, connection: { search_path: `${schema},public` } })
  const admin = postgres(LOCAL_TEST_DB_URL, { max: 1, onnotice: () => {}, connect_timeout: 3 })
  try {
    await admin`select 1`
  } catch (error) {
    console.warn(`[p77 STORY-005 test] SKIPPING DB-backed tests: ${parsed.host}${parsed.pathname} unreachable (${error instanceof Error ? error.message : String(error)}). Create it: createdb -h localhost core_sdk_p77_test`)
    await admin.end({ timeout: 1 }).catch(() => {})
    return null
  }
  await admin.unsafe(`CREATE SCHEMA ${schema}`)
  await admin.unsafe(`SET search_path TO ${schema}, public`)
  await admin.unsafe(RP_SCHEMA_DDL)
  const sessions: any[] = []
  const raw = open()
  sessions.push(raw)
  return {
    schema,
    raw,
    sql: sqlClientFromPostgresJs(raw),
    session: (max = 1) => {
      const r = open(max)
      sessions.push(r)
      return { raw: r, sql: sqlClientFromPostgresJs(r) }
    },
    close: async () => {
      for (const s of sessions) await s.end({ timeout: 5 }).catch(() => {})
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {})
      await admin.end({ timeout: 5 }).catch(() => {})
    },
  }
}

const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? new Date(v).toISOString() : null)

function rowOf(r: Record<string, unknown>): HandoffRow {
  return {
    handoffId: String(r.handoff_id),
    connectIssuer: String(r.connect_issuer),
    connectSub: String(r.connect_sub),
    localUserId: r.local_user_id == null ? null : Number(r.local_user_id),
    state: String(r.state) as HandoffState,
    handoffClass: String(r.handoff_class) as HandoffRow['handoffClass'],
    sourceDigest: (r.source_digest as string | null) ?? null,
    sourceRevision: iso(r.source_revision) ?? ((r.source_revision as string | null) ?? null),
    expectedLocalDigest: (r.expected_local_digest as string | null) ?? null,
    expectedLocalRevision: (r.expected_local_revision as string | null) ?? null,
    preparedAt: iso(r.prepared_at)!,
    prepareAckedAt: iso(r.prepare_acked_at),
    fencedAt: iso(r.fenced_at),
    activatedAt: iso(r.activated_at),
    failedReason: (r.failed_reason as string | null) ?? null,
    failRequestedAt: iso(r.fail_requested_at),
    failRequestedReason: (r.fail_requested_reason as string | null) ?? null,
    attempts: Number(r.attempts ?? 0),
    nextAttemptAt: iso(r.next_attempt_at)!,
    lastError: (r.last_error as string | null) ?? null,
    lastOutcome: (r.last_outcome as string | null) ?? null,
  }
}

export interface PgRpAdapterHooks {
  /** Awaited INSIDE the insert transaction, after the INSERT, while the lease is claimed and the users row lock is held. */
  insideInsert?: (ctx: { userId: number; handoffId: string }) => Promise<void>
}

export class PgRpAdapter implements RpAdapter {
  transportForSweep: HandoffTransport | null = null
  flagEnabled = false
  hooks: PgRpAdapterHooks = {}
  readonly handoffTable: HandoffTableAccess

  constructor(
    readonly system: RpSystem,
    readonly issuer: string,
    /** The client every write runs on (the route hands a LEASED one). */
    readonly db: RpSqlClient,
  ) {
    this.handoffTable = this.table()
  }

  private ex(): SqlExecutor {
    return this.db.execute
  }

  async readAuthority(userId: number): Promise<AuthorityRow> {
    const r = (await this.ex()(`SELECT credential_authority, credential_version, password IS NULL AS pw_null, connect_issuer, connect_sub FROM users WHERE id = $1`, [userId]))[0]
    if (!r) throw new Error(`no user ${userId}`)
    return { authority: String(r.credential_authority) as RpCredentialAuthority, version: Number(r.credential_version), passwordIsNull: Boolean(r.pw_null), issuer: (r.connect_issuer as string | null) ?? null, sub: (r.connect_sub as string | null) ?? null }
  }

  async readLocalCredential(userId: number): Promise<LocalCredentialRead | null> {
    const r = (await this.ex()(`SELECT password, updated_at, credential_authority FROM users WHERE id = $1`, [userId]))[0]
    if (!r) return null
    const pw = (r.password as string | null) ?? null
    const verifier = pw && BCRYPT_VERIFIER_RE.test(pw) ? pw : null
    return { verifier, digest: verifier ? digestVerifier(verifier) : null, revision: iso(r.updated_at)!, authority: String(r.credential_authority) as RpCredentialAuthority }
  }

  async *inventory(): AsyncIterable<RpUserInventoryRow> {
    const rows = await this.ex()(`SELECT id, email, password, updated_at, is_active, credential_authority, credential_version, connect_issuer, connect_sub, connect_mapped_at FROM users ORDER BY id`)
    for (const r of rows) {
      const pw = (r.password as string | null) ?? null
      yield {
        id: Number(r.id),
        uuid: null,
        email: r.email == null ? null : String(r.email).toLowerCase(),
        passwordDigest: pw ? digestVerifier(pw) : null,
        passwordRevision: iso(r.updated_at),
        isActive: Boolean(r.is_active),
        credentialAuthority: String(r.credential_authority) as RpCredentialAuthority,
        credentialVersion: Number(r.credential_version),
        connectIssuer: (r.connect_issuer as string | null) ?? null,
        connectSub: (r.connect_sub as string | null) ?? null,
        connectMappedAt: iso(r.connect_mapped_at),
        googleLinks: [],
        orgMemberships: [{ orgId: 1, orgUuid: null, role: 'member' }],
      }
    }
  }

  isSystemIdentity(row: RpUserInventoryRow): boolean {
    return !!row.email && row.email.endsWith('.invalid')
  }

  async state(): Promise<RpState> {
    const c = (await this.ex()(`SELECT
      count(*) FILTER (WHERE credential_authority = 'local' AND is_active AND email IS NOT NULL AND email NOT LIKE '%.invalid')::int AS eligible_local,
      count(*) FILTER (WHERE credential_authority = 'prepared')::int AS prepared,
      count(*) FILTER (WHERE credential_authority = 'fenced')::int AS fenced,
      count(*) FILTER (WHERE credential_authority = 'connect')::int AS connect,
      count(*) FILTER (WHERE email LIKE '%.invalid')::int AS system,
      count(*) FILTER (WHERE email IS NULL)::int AS phone_only
      FROM users`))[0]!
    const open = await this.ex()(`SELECT local_user_id FROM credential_handoff WHERE state IN ('prepared','fenced') ORDER BY prepared_at`)
    const refs = open.map((r) => String(r.local_user_id))
    return {
      system: this.system,
      schemaTag: 'test',
      flagEnabled: this.flagEnabled,
      counts: { eligibleLocal: Number(c.eligible_local), prepared: Number(c.prepared), fenced: Number(c.fenced), connect: Number(c.connect), system: Number(c.system), phoneOnly: Number(c.phone_only), inFlightOps: 0 },
      openHandoffs: refs.length,
      openHandoffRefs: refs,
    }
  }

  drain(): Promise<{ expired: number }> {
    return drainLeases(this.db)
  }

  async fence(userId: number, expected: { digest?: string; revision?: string }): Promise<FenceResult> {
    return this.db.transaction(async (tx) => {
      const u = (await tx.execute(`SELECT id, password, updated_at, credential_authority FROM users WHERE id = $1 FOR UPDATE NOWAIT`, [userId]))[0]
      if (!u) throw new Error(`no user ${userId}`)
      const rowRaw = (await tx.execute(`SELECT * FROM credential_handoff WHERE local_user_id = $1 AND state IN ('prepared','fenced') FOR UPDATE`, [userId]))[0]
      if (!rowRaw) return { outcome: 'refused', reason: 'no_handoff', handoffId: null }
      const row = rowOf(rowRaw)
      if (!row.prepareAckedAt) return { outcome: 'refused', reason: 'not_acked', handoffId: row.handoffId }
      const pw = (u.password as string | null) ?? null
      const verifier = pw && BCRYPT_VERIFIER_RE.test(pw) ? pw : null
      const digest = verifier ? digestVerifier(verifier) : null
      const revision = iso(u.updated_at)!
      switch (row.handoffClass) {
        case 'import':
          if (!verifier) return { outcome: 'refused', reason: 'verifier_missing', handoffId: row.handoffId }
          break
        case 'adopt':
        case 'retire':
          if ((expected.digest ?? null) !== digest || (expected.revision ?? null) !== revision) return { outcome: 'refused', reason: 'adopt_source_changed', handoffId: row.handoffId }
          break
        case 'recover':
          if (verifier) return { outcome: 'refused', reason: 'local_verifier_appeared', handoffId: row.handoffId }
          break
      }
      await tx.execute(`UPDATE users SET credential_authority = 'fenced' WHERE id = $1 AND credential_authority IN ('prepared','fenced')`, [userId])
      if (row.state === 'prepared') await tx.execute(`UPDATE credential_handoff SET state = 'fenced', fenced_at = clock_timestamp() WHERE handoff_id = $1::uuid`, [row.handoffId])
      return { outcome: 'fenced', handoffId: row.handoffId, handoffClass: row.handoffClass, digest, revision }
    })
  }

  async flipToConnect(userId: number, connectCv: number): Promise<void> {
    await this.ex()(`UPDATE users SET credential_authority = 'connect', password = NULL, credential_version = $2 WHERE id = $1`, [userId, connectCv])
  }

  async release(userId: number): Promise<'released' | 'no_handoff'> {
    return this.db.transaction(async (tx) => {
      await tx.execute(`SELECT id FROM users WHERE id = $1 FOR UPDATE NOWAIT`, [userId])
      const row = (await tx.execute(`SELECT handoff_id, fail_requested_reason FROM credential_handoff WHERE local_user_id = $1 AND state IN ('prepared','fenced') FOR UPDATE`, [userId]))[0]
      if (!row) return 'no_handoff'
      await tx.execute(`UPDATE users SET credential_authority = 'local' WHERE id = $1 AND credential_authority IN ('prepared','fenced')`, [userId])
      await tx.execute(`UPDATE credential_handoff SET state = 'failed', failed_reason = coalesce(fail_requested_reason, 'released') WHERE handoff_id = $1::uuid`, [row.handoff_id])
      return 'released'
    })
  }

  async invalidateLocalSessions(): Promise<void> {}

  async stampIssuer(userIds: number[], issuer: string): Promise<number> {
    const rows = await this.ex()(
      `UPDATE users SET connect_issuer = coalesce(connect_issuer, $2), connect_mapped_at = clock_timestamp()
        WHERE id = ANY($1::int[]) AND connect_sub IS NOT NULL AND (connect_issuer IS NULL OR connect_issuer = $2) RETURNING id`,
      [userIds, issuer],
    )
    return rows.length
  }

  async quarantineBinding(userId: number, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const u = (await tx.execute(`SELECT connect_sub FROM users WHERE id = $1 FOR UPDATE`, [userId]))[0]
      await tx.execute(`INSERT INTO connect_binding_quarantine (local_user_id, connect_sub, reason) VALUES ($1, $2, $3) ON CONFLICT (local_user_id) DO NOTHING`, [userId, u?.connect_sub ?? null, reason])
      await tx.execute(`UPDATE users SET connect_sub = NULL, connect_issuer = NULL WHERE id = $1`, [userId])
    })
  }

  async retireEmail(userId: number, survivingUserId: number, email: string, reason: string): Promise<'retired' | 'already_retired'> {
    return this.db.transaction(async (tx) => {
      const [a, b] = [Math.min(userId, survivingUserId), Math.max(userId, survivingUserId)]
      const rows = await tx.execute(`SELECT id, email, is_active FROM users WHERE id IN ($1, $2) ORDER BY id FOR UPDATE`, [a, b])
      const retired = rows.find((r) => Number(r.id) === userId)
      const survivor = rows.find((r) => Number(r.id) === survivingUserId)
      if (!retired || !survivor) throw Object.assign(new Error('source_changed'), { code: 'source_changed' })
      const receipt = (await tx.execute(`SELECT 1 FROM user_email_retirements WHERE user_id = $1 AND original_email = $2 AND surviving_user_id = $3`, [userId, email, survivingUserId]))[0]
      if (receipt && String(retired.email) === `retired+${userId}@retired.invalid` && !retired.is_active) return 'already_retired'
      if (String(retired.email).toLowerCase() !== email || String(survivor.email).toLowerCase() !== email) throw Object.assign(new Error('source_changed'), { code: 'source_changed' })
      await tx.execute(`INSERT INTO user_email_retirements (user_id, original_email, surviving_user_id, reason, by) VALUES ($1, $2, $3, $4, 'test')`, [userId, email, survivingUserId, reason])
      await tx.execute(`UPDATE users SET email = $2, is_active = false WHERE id = $1`, [userId, `retired+${userId}@retired.invalid`])
      await tx.execute(`INSERT INTO connect_session_revocations (connect_issuer, connect_sub, local_user_id, jti) VALUES ($1, NULL, $2, $3)`, [this.issuer, userId, `retire-${userId}-${Date.now()}`])
      return 'retired'
    })
  }

  async deactivate(userId: number, reason: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(`UPDATE users SET is_active = false WHERE id = $1`, [userId])
      await tx.execute(`INSERT INTO user_deactivations (user_id, reason) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [userId, reason])
    })
  }

  async unmappedBindings(limit: number): Promise<Array<{ userId: number; sub: string }>> {
    const rows = await this.ex()(`SELECT id, connect_sub FROM users WHERE connect_sub IS NOT NULL AND connect_mapped_at IS NULL ORDER BY id LIMIT $1`, [limit])
    return rows.map((r) => ({ userId: Number(r.id), sub: String(r.connect_sub) }))
  }

  async markMapped(userId: number): Promise<void> {
    await this.ex()(`UPDATE users SET connect_mapped_at = clock_timestamp() WHERE id = $1`, [userId])
  }

  async sweepMappings(limit: number): Promise<{ registered: number; conflicts: number }> {
    if (!this.transportForSweep) throw new Error('pg adapter: transportForSweep not set')
    const r = await sweepMappings({ adapter: this, transport: this.transportForSweep, limit })
    return { registered: r.registered, conflicts: r.conflicts }
  }

  private table(): HandoffTableAccess {
    const self = this
    return {
      async readHandoff(handoffId) {
        const r = (await self.ex()(`SELECT * FROM credential_handoff WHERE handoff_id = $1::uuid`, [handoffId]))[0]
        return r ? rowOf(r) : null
      },
      async readOpenHandoffForUser(userId) {
        const r = (await self.ex()(`SELECT * FROM credential_handoff WHERE local_user_id = $1 AND state IN ('prepared','fenced')`, [userId]))[0]
        return r ? rowOf(r) : null
      },
      async listDue(limit) {
        return self.db.transaction(async (tx) => (await tx.execute(RECONCILER_CLAIM_SQL, [limit])).map(rowOf))
      },
      async insert(input) {
        return self.db.transaction(async (tx) => {
          const u = (await tx.execute(`SELECT id, credential_authority FROM users WHERE id = $1 FOR UPDATE NOWAIT`, [input.localUserId]))[0]
          if (!u) throw new Error(`no user ${input.localUserId}`)
          if (u.credential_authority !== 'local') throw Object.assign(new Error(`credential_authority transition refused: ${u.credential_authority} → prepared`), { code: '23000' })
          const r = (
            await tx.execute(
              `INSERT INTO credential_handoff (connect_issuer, connect_sub, local_user_id, state, handoff_class, source_digest, source_revision, expected_local_digest, expected_local_revision)
               VALUES ($1, $2, $3, 'prepared', $4, $5, $6, $7, $8) RETURNING *`,
              [input.connectIssuer, input.connectSub, input.localUserId, input.handoffClass, input.sourceDigest, input.sourceRevision, input.expectedLocalDigest, input.expectedLocalRevision],
            )
          )[0]!
          await tx.execute(`UPDATE users SET credential_authority = 'prepared' WHERE id = $1`, [input.localUserId])
          const row = rowOf(r)
          if (self.hooks.insideInsert) await self.hooks.insideInsert({ userId: input.localUserId, handoffId: row.handoffId })
          return row
        })
      },
      async transition(handoffId, to, patch = {}) {
        return self.db.transaction(async (tx) => {
          const cur = (await tx.execute(`SELECT * FROM credential_handoff WHERE handoff_id = $1::uuid FOR UPDATE`, [handoffId]))[0]
          if (!cur) throw new Error(`handoff ${handoffId} vanished`)
          const row = rowOf(cur)
          const sets: string[] = []
          const params: unknown[] = [handoffId]
          const set = (col: string, v: unknown) => {
            params.push(v)
            sets.push(`${col} = $${params.length}`)
          }
          if (to !== row.state) {
            const legal: Record<HandoffState, HandoffState[]> = { prepared: ['fenced', 'failed'], fenced: ['activated', 'failed'], activated: [], failed: [] }
            if (!legal[row.state].includes(to)) throw Object.assign(new Error(`credential_handoff transition refused: ${row.state} → ${to}`), { code: '23000' })
            if (row.state === 'prepared' && to === 'fenced' && !(row.prepareAckedAt || patch.prepareAckedAt)) throw Object.assign(new Error('credential_handoff transition refused: prepared → fenced while prepare_acked_at IS NULL (M5)'), { code: '23000' })
            set('state', to)
            if (to === 'fenced') sets.push('fenced_at = clock_timestamp()')
            if (to === 'activated') sets.push('activated_at = clock_timestamp()')
          }
          if (patch.nextAttemptAt !== undefined && patch.nextAttemptAt !== row.nextAttemptAt) sets.push('attempts = attempts + 1')
          const cols: Record<string, string> = { sourceDigest: 'source_digest', sourceRevision: 'source_revision', prepareAckedAt: 'prepare_acked_at', failedReason: 'failed_reason', failRequestedAt: 'fail_requested_at', failRequestedReason: 'fail_requested_reason', lastError: 'last_error', lastOutcome: 'last_outcome', nextAttemptAt: 'next_attempt_at' }
          for (const [k, col] of Object.entries(cols)) {
            const v = (patch as Record<string, unknown>)[k]
            if (v !== undefined) set(col, v)
          }
          if (sets.length === 0) return row
          const updated = (await tx.execute(`UPDATE credential_handoff SET ${sets.join(', ')} WHERE handoff_id = $1::uuid RETURNING *`, params))[0]!
          return rowOf(updated)
        })
      },
    }
  }
}

/** Seed helpers for the tests. */
export async function seedUser(sql: RpSqlClient, u: { id: number; email: string | null; password?: string | null; connectSub?: string | null; issuer?: string | null; authority?: RpCredentialAuthority; active?: boolean; mappedAt?: boolean }): Promise<void> {
  await sql.execute(
    `INSERT INTO users (id, email, password, connect_issuer, connect_sub, credential_authority, is_active, connect_mapped_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8 THEN now() ELSE NULL END)`,
    [u.id, u.email, u.password ?? null, u.issuer ?? null, u.connectSub ?? null, u.authority ?? 'local', u.active ?? true, u.mappedAt ?? false],
  )
}

export async function readUser(sql: RpSqlClient, id: number): Promise<{ authority: string; password: string | null; version: number; email: string | null; active: boolean; issuer: string | null; sub: string | null; mappedAt: string | null } | null> {
  const r = (await sql.execute(`SELECT credential_authority, password, credential_version, email, is_active, connect_issuer, connect_sub, connect_mapped_at FROM users WHERE id = $1`, [id]))[0]
  if (!r) return null
  return { authority: String(r.credential_authority), password: (r.password as string | null) ?? null, version: Number(r.credential_version), email: (r.email as string | null) ?? null, active: Boolean(r.is_active), issuer: (r.connect_issuer as string | null) ?? null, sub: (r.connect_sub as string | null) ?? null, mappedAt: iso(r.connect_mapped_at) }
}

export async function handoffRows(sql: RpSqlClient, userId?: number): Promise<HandoffRow[]> {
  const rows = userId == null ? await sql.execute(`SELECT * FROM credential_handoff ORDER BY prepared_at`) : await sql.execute(`SELECT * FROM credential_handoff WHERE local_user_id = $1 ORDER BY prepared_at`, [userId])
  return rows.map(rowOf)
}

export async function leaseRows(sql: RpSqlClient): Promise<Array<{ op: string; outcome: string | null; finished: boolean; expired: boolean }>> {
  const rows = await sql.execute(`SELECT op, outcome, finished_at IS NOT NULL AS finished, lease_until <= clock_timestamp() AS expired FROM connect_operator_leases ORDER BY started_at`)
  return rows.map((r) => ({ op: String(r.op), outcome: (r.outcome as string | null) ?? null, finished: Boolean(r.finished), expired: Boolean(r.expired) }))
}
