/**
 * Test support (p77 STORY-005): a whole local ESTATE — the loopback IdP
 * (`FakeEstateIdp`: JWKS, the switch row, the handoff plane) and N relying
 * parties, each a REAL local Postgres scratch schema behind the REAL route
 * handlers of `createConnectInternalRoutes`, mounted on `node:http`. The
 * estate driver, the lifter, the backfill and the email reconcile talk to
 * them through `createRpOpsClient` over real HTTP. The advisory lock is a
 * real `pg_try_advisory_lock` on a dedicated session.
 */
import type { RpSystem } from '../../../adapter/index.js'
import { createHandoffTransport } from '../../../server/handoff/transport.js'
import { __resetFreshnessCachesForTests } from '../../../server/revocation/freshness.js'
import { __resetJwksCacheForTests } from '../../../server/revocation/logout-token.js'
import { __resetMaintenanceCacheForTests } from '../../../server/revocation/maintenance.js'
import { createConnectInternalRoutes, type ConnectInternalRouteDeps, type DeactivateAllowlistEntry } from '../../../next-auth/internal-routes.js'
import { startFakeEstateIdp, type FakeEstateIdp } from '../../../next-auth/__tests__/support/estate-idp.js'
import { openPgTestDb, PgRpAdapter, type PgTestDb } from '../../../next-auth/__tests__/support/pg-adapter.js'
import { startRpServer, type RpServer } from '../../../next-auth/__tests__/support/rp-server.js'
import type { EstateLock } from '../../estate.js'
import { createRpOpsClient, RP_HANDOFF_ROUTE_PATH, type RpOpsClient } from '../../rp-client.js'
import type { ConnectEnv } from '../../../next-auth/internal-routes.js'

export interface EstateRp {
  system: RpSystem
  db: PgTestDb
  server: RpServer
  key: string
  /** A client with NO operator token (the driver/lifter wraps it with theirs). */
  client: RpOpsClient
  adapters: PgRpAdapter[]
  flag: { on: boolean }
  hooks: NonNullable<ConnectInternalRouteDeps['hooks']>
  /** Every mutating request's op, in order (from the request bodies). */
  ops: string[]
}

export interface Estate {
  idp: FakeEstateIdp
  rps: Partial<Record<RpSystem, EstateRp>>
  clock: { t: number; now: () => Date }
  /** A real advisory lock over a dedicated Postgres session of the FIRST RP's database (stands in for the IdP DB). */
  lock: EstateLock & { session: { raw: any } }
  /** A second, independent session for "another driver". */
  lockFor(): EstateLock
  clientsWith(token: () => string | null): Partial<Record<RpSystem, RpOpsClient>>
  close(): Promise<void>
}

export async function startEstate(input: { systems: RpSystem[]; env?: ConnectEnv; allowlist?: DeactivateAllowlistEntry[] }): Promise<Estate | null> {
  __resetMaintenanceCacheForTests()
  __resetFreshnessCachesForTests()
  __resetJwksCacheForTests()
  const idp = await startFakeEstateIdp()
  const clock = { t: Date.now(), now: () => new Date(clock.t) }
  const rps: Estate['rps'] = {}
  const closers: Array<() => Promise<void>> = [async () => idp.stop()]
  for (const system of input.systems) {
    const db = await openPgTestDb(`p77_${system}`)
    if (!db) {
      for (const c of closers) await c()
      return null
    }
    closers.push(() => db.close())
    const key = `${system}-internal-key-0123456789`
    const flag = { on: false }
    const hooks: NonNullable<ConnectInternalRouteDeps['hooks']> = {}
    const adapters: PgRpAdapter[] = []
    const ops: string[] = []
    const routes = createConnectInternalRoutes({
      system,
      env: input.env ?? 'local',
      keyEnvName: 'CONNECT_INTERNAL_KEY',
      environment: { CONNECT_INTERNAL_KEY: key },
      sql: db.session(4).sql,
      adapter: (sqlc) => {
        const a = new PgRpAdapter(system, idp.issuer, sqlc)
        a.flagEnabled = flag.on
        a.transportForSweep = createHandoffTransport({ issuer: idp.issuer, rpKey: idp.rpKey, system })
        adapters.push(a)
        return a
      },
      connect: { issuer: idp.issuer, rpKey: idp.rpKey, timeoutMs: 3_000 },
      connectEnabled: () => flag.on,
      deactivateAllowlist: input.allowlist ?? [],
      now: clock.now,
      logger: { error: () => {}, warn: () => {}, log: () => {} },
      hooks,
    })
    const recording = async (request: Request): Promise<Response> => {
      const body = (await request.clone().json().catch(() => ({}))) as { op?: string }
      if (body.op) ops.push(body.op)
      return routes.credentialHandoff(request)
    }
    const server = await startRpServer({ [RP_HANDOFF_ROUTE_PATH]: recording })
    closers.push(() => server.close())
    rps[system] = { system, db, server, key, client: createRpOpsClient({ system, origin: server.origin, rpKey: key, timeoutMs: 5_000 }), adapters, flag, hooks, ops }
  }
  const first = rps[input.systems[0]!]!
  const lockOver = (raw: any): EstateLock => ({
    tryAcquire: async (env) => Boolean((await raw.unsafe(`SELECT pg_try_advisory_lock(hashtext($1)) AS got`, [`p77:cutover:${env}`]))[0].got),
    release: async (env) => {
      await raw.unsafe(`SELECT pg_advisory_unlock(hashtext($1))`, [`p77:cutover:${env}`])
    },
  })
  const lockSession = first.db.session(1)
  return {
    idp,
    rps,
    clock,
    lock: { ...lockOver(lockSession.raw), session: lockSession },
    lockFor: () => lockOver(first.db.session(1).raw),
    clientsWith: (token) => Object.fromEntries(Object.entries(rps).map(([s, rp]) => [s, rp!.client.withOperatorToken(token)])) as Partial<Record<RpSystem, RpOpsClient>>,
    close: async () => {
      for (const c of closers.reverse()) await c()
    },
  }
}
