/**
 * p77 STORY-004 — the handoff driver, the reconciler and the mapping sweep
 * over an in-memory `RpAdapter` and a REAL loopback Connect (node:http).
 * No `vi.mock` of http or db anywhere.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createHandoffDriver, digestVerifier, type DriverHooks, type HandoffDriver, type HandoffLogEvent } from '../driver.js'
import { reconcile } from '../reconciler.js'
import { sweepMappings } from '../sweep.js'
import { createHandoffTransport, type HandoffTransport } from '../transport.js'
import { FakeRpAdapter, bcryptLike } from './support/fake-adapter.js'
import { startFakeConnect, type FakeConnect } from './support/fake-connect.js'
import type { RpSystem } from '../../../adapter/index.js'

const A = bcryptLike('crm-hash-A')
const B = bcryptLike('yobo-hash-B')
const C = bcryptLike('connect-password-C')
const D = bcryptLike('new-local-D')

class Crash extends Error {
  constructor(public readonly at: string) {
    super(`crash:${at}`)
  }
}

interface Estate {
  fc: FakeConnect
  clock: { t: number; now: () => Date }
  crm: FakeRpAdapter
  yobo: FakeRpAdapter
  token: { current: string | null }
  events: HandoffLogEvent[]
  transport: (system: RpSystem) => HandoffTransport
  driver: (adapter: FakeRpAdapter, extra?: { hooks?: DriverHooks; connectEnabled?: boolean; operatorCutover?: boolean; transport?: HandoffTransport }) => HandoffDriver
}

let e: Estate

async function makeEstate(): Promise<Estate> {
  const fc = await startFakeConnect()
  const clock = { t: Date.parse('2026-09-23T10:00:00Z'), now: () => new Date(clock.t) }
  const crm = new FakeRpAdapter('crm', fc.issuer, clock)
  const yobo = new FakeRpAdapter('yobo', fc.issuer, clock)
  const token = { current: 'J1' as string | null }
  fc.jti = 'J1'
  const events: HandoffLogEvent[] = []
  fc.addUser({ id: 101 })
  crm.addUser({ id: 1, connectSub: '101', password: A })
  yobo.addUser({ id: 7, connectSub: '101', password: B })
  fc.bind('crm', '1', 101)
  fc.bind('yobo', '7', 101)
  const transport = (system: RpSystem) =>
    createHandoffTransport({ issuer: fc.issuer, rpKey: fc.rpKey, system, operatorToken: () => token.current, timeoutMs: 2_000 })
  const driver: Estate['driver'] = (adapter, extra = {}) =>
    createHandoffDriver({
      adapter,
      transport: extra.transport ?? transport(adapter.system),
      connectEnabled: extra.connectEnabled ?? false,
      operatorCutover: extra.operatorCutover ?? true,
      now: () => clock.now(),
      log: (ev) => events.push(ev),
      hooks: extra.hooks,
    })
  return { fc, clock, crm, yobo, token, events, transport, driver }
}

const kinds = (ev: HandoffLogEvent[]) => ev.map((x) => x.kind)
const stagedVerifiers = (fc: FakeConnect) => fc.requests.filter((r) => r.route === 'handoff/prepare' && r.body?.source?.verifier).map((r) => r.body.source.verifier)

beforeEach(async () => {
  e = await makeEstate()
})
afterEach(async () => {
  await e.fc.stop()
})

// =============================================================================
// The flag rule (AC7) and the plain happy paths
// =============================================================================

describe('flag rule — connect_disabled without operatorCutover (AC7)', () => {
  it('both flags off, no operatorCutover → connect_disabled, no row written, Connect never asked', async () => {
    const d = e.driver(e.crm, { operatorCutover: false, connectEnabled: false })
    const r = await d.prepare(1, { expectedClass: 'import' })
    expect(r).toEqual({ ok: false, handoff: null, outcome: 'connect_disabled' })
    expect(e.crm.writes).toBe(0)
    expect(e.crm.rows.size).toBe(0)
    expect(e.fc.hits['handoff/classify'] ?? 0).toBe(0)
  })

  it('operatorCutover set by the route → a new handoff opens with the flag off', async () => {
    const r = await e.driver(e.crm, { operatorCutover: true }).prepare(1, { expectedClass: 'import' })
    expect(r.ok).toBe(true)
    expect(e.crm.rows.size).toBe(1)
  })

  it('flag on, no operatorCutover (the application path) → opens too', async () => {
    const r = await e.driver(e.crm, { operatorCutover: false, connectEnabled: true }).prepare(1)
    expect(r.ok).toBe(true)
  })

  it('an open handoff is resumed whatever the flag says', async () => {
    await e.driver(e.crm).prepare(1, { expectedClass: 'import' })
    const r = await e.driver(e.crm, { operatorCutover: false, connectEnabled: false }).prepare(1)
    expect(r.ok && r.resumed).toBe(true)
  })
})

describe('import — the three-step prepare, fence, activate, flip', () => {
  it('classify → local insert (authority prepared, class persisted) → handoff/prepare stages → acked; fence; activate; flip', async () => {
    const d = e.driver(e.crm)
    const run = await d.run(1, { expectedClass: 'import' })
    expect(run.outcome).toBe('connect')
    expect(run.prepare.ok && run.prepare.handoffClass).toBe('import')
    const row = [...e.crm.rows.values()][0]
    expect(row.state).toBe('activated')
    expect(row.handoffClass).toBe('import')
    expect(row.sourceDigest).toBe(digestVerifier(A))
    expect(row.prepareAckedAt).not.toBeNull()
    const u = e.crm.users.get(1)!
    expect(u.authority).toBe('connect')
    expect(u.password).toBeNull()
    expect(u.credentialVersion).toBe(2) // Connect's post-activation version, not local history
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.fc.receipt('crm', '1')).toMatchObject({ handoffClass: 'import', state: 'activated', established: true })
    // The order of Connect calls is the handshake's: classify, prepare, activate.
    expect(e.fc.requests.filter((r) => r.route.startsWith('handoff/')).map((r) => r.route)).toEqual(['handoff/classify', 'handoff/prepare', 'handoff/activate'])
    // The operator token travelled on every handoff call (D23).
    expect(e.fc.requests.every((r) => r.operator === 'J1')).toBe(true)
    // activate re-asserts the fence under the lock before it asks Connect (the p79 order).
    expect(kinds(e.events)).toEqual(['classified', 'prepared', 'prepare_acked', 'fenced', 'fence_reasserted', 'activated'])
  })

  it('a rerun for a connect user answers already_activated at the estate level and asks Connect nothing', async () => {
    await e.driver(e.crm).run(1, { expectedClass: 'import' })
    const hits = e.fc.requests.length
    const again = await e.driver(e.crm).run(1, { expectedClass: 'import' })
    expect(again.outcome).toBe('already_activated')
    expect(again.prepare).toMatchObject({ ok: false, outcome: 'already_connect' })
    expect(e.fc.requests.length).toBe(hits)
  })
})

// =============================================================================
// Crash matrix (§6.4) — one hook per step; a rerun or the reconciler converges
// =============================================================================

describe('crash after each step, then the reconciler', () => {
  it('after classify → nothing written; the rerun classifies again and completes', async () => {
    const d = e.driver(e.crm, { hooks: { afterClassify: async () => { throw new Crash('classify') } } })
    await expect(d.prepare(1, { expectedClass: 'import' })).rejects.toThrow('crash:classify')
    expect(e.crm.writes).toBe(0)
    expect(e.crm.rows.size).toBe(0)
    expect(e.fc.receipt('crm', '1')).toBeUndefined()
    expect(e.fc.staged.size).toBe(0)
    const run = await e.driver(e.crm).run(1, { expectedClass: 'import' })
    expect(run.outcome).toBe('connect')
  })

  it('after the local insert → prepared with prepare_acked_at NULL; Connect holds nothing; the reconciler re-posts, fences, activates', async () => {
    const d = e.driver(e.crm, { hooks: { afterLocalInsert: async () => { throw new Crash('insert') } } })
    await expect(d.prepare(1, { expectedClass: 'import' })).rejects.toThrow('crash:insert')
    const row = e.crm.openRow(1)!
    expect(row.state).toBe('prepared')
    expect(row.prepareAckedAt).toBeNull()
    expect(e.crm.users.get(1)!.authority).toBe('prepared')
    expect(e.fc.hits['handoff/prepare'] ?? 0).toBe(0)
    // The fence is refused before Connect confirms the class.
    expect(await e.driver(e.crm).fence(1)).toMatchObject({ ok: false, outcome: 'refused', detail: { why: 'prepare_unacked' } })
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.items[0]?.outcome).toBe('activated')
    expect(rep.remaining).toBe(0)
    expect(e.crm.users.get(1)!.authority).toBe('connect')
    expect(e.fc.users.get(101)!.password).toBe(A)
  })

  it('after handoff/prepare acked → prepared+acked; the reconciler fences and activates (nothing staged twice)', async () => {
    const d = e.driver(e.crm, { hooks: { afterPrepareAck: async () => { throw new Crash('ack') } } })
    await expect(d.prepare(1, { expectedClass: 'import' })).rejects.toThrow('crash:ack')
    expect(e.crm.openRow(1)!.prepareAckedAt).not.toBeNull()
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.items[0]?.outcome).toBe('activated')
    expect(e.fc.stagedHistory).toEqual([A]) // the re-post answered `staged` idempotently, no second staging
    expect(e.crm.users.get(1)!.authority).toBe('connect')
  })

  it('AC1 — after the fence: the reconciler re-asserts the fence (no new local session meanwhile) and replays the activation', async () => {
    const d = e.driver(e.crm, { hooks: { afterFence: async () => { throw new Crash('fence') } } })
    await expect(d.run(1, { expectedClass: 'import' })).rejects.toThrow('crash:fence')
    expect(e.crm.users.get(1)!.authority).toBe('fenced') // no new local session can be issued
    expect(e.crm.openRow(1)!.state).toBe('fenced')
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now(), log: (ev) => e.events.push(ev) })
    expect(kinds(e.events)).toContain('fence_reasserted')
    expect(rep.items[0]?.outcome).toBe('activated')
    expect(e.crm.users.get(1)!.authority).toBe('connect')
    expect(e.fc.users.get(101)!.password).toBe(A)
  })

  it("AC1 — after Connect's activation with the reply lost: activate answers already_activated and the flip completes", async () => {
    const d = e.driver(e.crm, { hooks: { afterConnectActivation: async () => { throw new Crash('activation-reply') } } })
    await expect(d.run(1, { expectedClass: 'import' })).rejects.toThrow('crash:activation-reply')
    expect(e.fc.receipt('crm', '1')!.state).toBe('activated')
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.crm.users.get(1)!.authority).toBe('fenced')
    expect(e.crm.openRow(1)!.state).toBe('fenced')
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now(), log: (ev) => e.events.push(ev) })
    expect(rep.items[0]?.outcome).toBe('activation_replayed')
    expect(e.fc.requests.filter((r) => r.route === 'handoff/activate').at(-1)?.body).toBeDefined()
    expect(e.crm.users.get(1)!).toMatchObject({ authority: 'connect', password: null, credentialVersion: 2 })
    expect(e.crm.rows.size).toBe(1)
    expect([...e.crm.rows.values()][0].state).toBe('activated')
  })

  it('after the flip, before the row transition → the next pass completes the row without asking Connect', async () => {
    const d = e.driver(e.crm, { hooks: { afterFlip: async () => { throw new Crash('flip') } } })
    await expect(d.run(1, { expectedClass: 'import' })).rejects.toThrow('crash:flip')
    expect(e.crm.users.get(1)!.authority).toBe('connect')
    expect(e.crm.openRow(1)!.state).toBe('fenced')
    const hits = e.fc.requests.length
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.items[0]?.outcome).toBe('flip_completed')
    expect(rep.flipsCompleted).toBe(1)
    expect(e.fc.requests.length).toBe(hits)
    expect(e.crm.openRow(1)).toBeNull()
  })
})

// =============================================================================
// Activation wins (AC2); release only on Connect's word
// =============================================================================

describe('activation wins and release', () => {
  it('AC2 — Connect answers 409 already_activated to a fail → the driver completes the flip instead of releasing', async () => {
    const d = e.driver(e.crm, { hooks: { afterConnectActivation: async () => { throw new Crash('activation-reply') } } })
    await expect(d.run(1, { expectedClass: 'import' })).rejects.toThrow()
    // The operator now asks for a release (a late fail): Connect has already activated.
    const r = await e.driver(e.crm).release(1, 'operator_abort')
    expect(r.outcome).toBe('already_activated')
    expect(e.fc.requests.filter((x) => x.route === 'handoff/fail').at(-1)?.status).toBe(409)
    expect(e.crm.users.get(1)!).toMatchObject({ authority: 'connect', password: null })
    expect(r.handoff?.state).toBe('activated')
    expect(kinds(e.events)).toContain('completed_over_fail')
  })

  it('release for a user with no open handoff → no_handoff, nothing written; for a connect row → no_handoff, row untouched', async () => {
    expect(await e.driver(e.crm).release(1)).toEqual({ outcome: 'no_handoff', handoff: null })
    expect(e.crm.writes).toBe(0)
    await e.driver(e.crm).run(1, { expectedClass: 'import' })
    const before = { writes: e.crm.writes, row: { ...[...e.crm.rows.values()][0] }, user: { ...e.crm.users.get(1)! } }
    expect(await e.driver(e.crm).release(1)).toEqual({ outcome: 'no_handoff', handoff: null })
    expect(e.crm.writes).toBe(before.writes)
    expect([...e.crm.rows.values()][0]).toEqual(before.row)
    expect(e.crm.users.get(1)).toEqual(before.user)
    expect(e.fc.hits['handoff/fail'] ?? 0).toBe(0)
  })

  it('release persists fail_requested first; Connect unreachable → carried on the next reconcile; released on its word', async () => {
    await e.driver(e.crm).prepare(1, { expectedClass: 'import' })
    e.fc.withhold.add('handoff/fail')
    const r = await e.driver(e.crm).release(1, 'abort')
    expect(r.outcome).toBe('connect_unreachable')
    const row = e.crm.openRow(1)!
    expect(row.failRequestedAt).not.toBeNull()
    expect(row.failRequestedReason).toBe('abort')
    expect(row.state).toBe('prepared')
    expect(e.crm.users.get(1)!.authority).toBe('prepared') // not released on our word alone
    e.fc.withhold.delete('handoff/fail')
    e.clock.t += 6_000 // past the 5 s backoff
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.items[0]).toMatchObject({ outcome: 'failed', to: 'failed' })
    expect(e.crm.users.get(1)!.authority).toBe('local')
    expect(e.fc.receipt('crm', '1')!.state).toBe('failed')
    expect(e.fc.staged.size).toBe(0) // Connect purged the staged row on its fail
    expect(e.crm.openRow(1)).toBeNull()
  })
})

// =============================================================================
// adopt (AC3, AC5), recover, local_verifier_appeared
// =============================================================================

describe('adopt — Connect already holds a password (I8)', () => {
  it('AC3 — Connect password A and RP password B before prepare → adopt persisted, nothing staged, fence on the pinned digest, RP flips with password NULL, Connect keeps A', async () => {
    e.fc.users.get(101)!.password = A
    const run = await e.driver(e.yobo).run(7, { expectedClass: 'adopt' })
    expect(run.outcome).toBe('connect')
    const row = [...e.yobo.rows.values()][0]
    expect(row.handoffClass).toBe('adopt')
    expect(row.sourceDigest).toBeNull()
    expect(row.expectedLocalDigest).toBe(digestVerifier(B))
    expect(row.expectedLocalRevision).toBe(e.yobo.users.get(7)!.updatedAt)
    expect(stagedVerifiers(e.fc)).toEqual([])
    expect(e.fc.stagedHistory).toEqual([])
    expect(e.fc.requests.map((r) => r.route).filter((r) => r.startsWith('handoff/'))).toEqual(['handoff/classify', 'handoff/prepare', 'handoff/activate-existing'])
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'connect', password: null })
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.fc.receipt('yobo', '7')).toMatchObject({ handoffClass: 'adopt', state: 'activated', established: false })
  })

  it('AC5 — the local password changes between prepare and fence → adopt_source_changed → released on Connect\'s word; the rerun re-prepares as adopt with the new digest and completes; never import; Connect untouched', async () => {
    e.fc.users.get(101)!.password = C
    const d = e.driver(e.yobo, { hooks: { afterPrepareAck: async () => e.yobo.setLocalPassword(7, D) } })
    const run = await d.run(7, { expectedClass: 'adopt' })
    expect(run.outcome).toBe('failed')
    expect(run.fence).toMatchObject({ outcome: 'failed', detail: { reason: 'adopt_source_changed' } })
    expect(e.yobo.users.get(7)!.authority).toBe('local')
    const failed = [...e.yobo.rows.values()][0]
    expect(failed.state).toBe('failed')
    expect(failed.failedReason).toBe('adopt_source_changed')
    expect(e.fc.requests.filter((r) => r.route === 'handoff/fail')).toHaveLength(1)
    expect(e.fc.receipt('yobo', '7')!.state).toBe('failed')
    // Rerun: classified adopt again, pinned to the NEW digest, completes.
    const again = await e.driver(e.yobo).run(7, { expectedClass: 'adopt' })
    expect(again.outcome).toBe('connect')
    const rows = [...e.yobo.rows.values()]
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.handoffClass === 'adopt')).toBe(true)
    expect(rows[1].expectedLocalDigest).toBe(digestVerifier(D))
    expect(e.fc.stagedHistory).toEqual([])
    expect(e.fc.users.get(101)!.password).toBe(C)
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'connect', password: null })
  })
})

describe('recover — no hash anywhere', () => {
  beforeEach(() => {
    e.yobo.users.get(7)!.password = null
  })

  it('waiting: Connect holds nothing → no_connect_credential_yet → failed → released; once Connect has a password the rerun classifies adopt and completes', async () => {
    const run = await e.driver(e.yobo).run(7, { expectedClass: 'recover' })
    expect(run.prepare.ok && run.prepare.handoffClass).toBe('recover')
    expect(run.outcome).toBe('failed')
    expect(run.activate).toMatchObject({ outcome: 'failed', detail: { reason: 'no_connect_credential_yet' } })
    expect(e.yobo.users.get(7)!.authority).toBe('local')
    expect(kinds(e.events)).toContain('recover_refused')
    const row = [...e.yobo.rows.values()][0]
    expect(row.sourceDigest).toBeNull()
    expect(row.expectedLocalDigest).toBeNull()
    expect(row.expectedLocalRevision).toBeNull()
    e.fc.users.get(101)!.password = C
    const again = await e.driver(e.yobo).run(7, { expectedClass: 'adopt' })
    expect(again.outcome).toBe('connect')
    expect(e.yobo.users.get(7)!.authority).toBe('connect')
    expect(e.fc.stagedHistory).toEqual([])
  })

  it('local_verifier_appeared: a verifier set under a recover row fails the fence; the rerun imports it', async () => {
    const d = e.driver(e.yobo, { hooks: { afterPrepareAck: async () => e.yobo.setLocalPassword(7, D) } })
    const run = await d.run(7, { expectedClass: 'recover' })
    expect(run.outcome).toBe('failed')
    expect(run.fence).toMatchObject({ outcome: 'failed', detail: { reason: 'local_verifier_appeared' } })
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'local', password: D }) // never discarded
    const again = await e.driver(e.yobo).run(7, { expectedClass: 'import' })
    expect(again.outcome).toBe('connect')
    expect(e.fc.users.get(101)!.password).toBe(D)
    expect(e.fc.stagedHistory).toEqual([D])
  })
})

// =============================================================================
// D10 establishment — import + retire in the driver's real order (AC9), canonical_pending (AC6)
// =============================================================================

describe("D10 — crm hash A, yobo hash B, Connect NULL, manifest elects crm", () => {
  it('AC9 — crm runs to completion, THEN yobo classifies: retire by the receipt rule, nothing staged, activate-existing accepted at once', async () => {
    const crmRun = await e.driver(e.crm).run(1, { expectedClass: 'import' })
    expect(crmRun.outcome).toBe('connect')
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.fc.receipt('crm', '1')).toMatchObject({ established: true, state: 'activated' })
    // Only now is yobo's row first classified.
    const before = e.fc.requests.filter((r) => r.system === 'yobo').length
    expect(before).toBe(0)
    const yoboRun = await e.driver(e.yobo).run(7, { expectedClass: 'retire' })
    expect(yoboRun.prepare.ok && yoboRun.prepare.handoffClass).toBe('retire')
    expect(yoboRun.outcome).toBe('connect')
    const yrow = [...e.yobo.rows.values()][0]
    expect(yrow).toMatchObject({ handoffClass: 'retire', state: 'activated', sourceDigest: null, expectedLocalDigest: digestVerifier(B) })
    expect(e.fc.stagedHistory).toEqual([A]) // the staging transport never saw B
    expect(stagedVerifiers(e.fc)).toEqual([A])
    expect(e.fc.requests.filter((r) => r.system === 'yobo').map((r) => r.route)).toEqual(['handoff/classify', 'handoff/prepare', 'handoff/activate-existing'])
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.crm.users.get(1)!).toMatchObject({ authority: 'connect', password: null })
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'connect', password: null })
    expect([...e.fc.receipts.values()].filter((r) => r.established)).toHaveLength(1)
  })

  it('AC9 — the driver dies after crm and before yobo; the same manifest rerun after a process restart: crm already_activated, yobo retire again', async () => {
    await e.driver(e.crm).run(1, { expectedClass: 'import' })
    // yobo is classified (retire) and the process dies before its local insert.
    let answered: string | null = null
    const dying = e.driver(e.yobo, { hooks: { afterClassify: async ({ handoffClass }) => { answered = handoffClass; throw new Crash('process') } } })
    await expect(dying.prepare(7, { expectedClass: 'retire' })).rejects.toThrow('crash:process')
    expect(answered).toBe('retire')
    expect(e.yobo.rows.size).toBe(0)
    // Process restart: the driver module is re-imported.
    vi.resetModules()
    const fresh = await import('../driver.js')
    const mk = (adapter: FakeRpAdapter) =>
      fresh.createHandoffDriver({ adapter, transport: e.transport(adapter.system), connectEnabled: false, operatorCutover: true, now: () => e.clock.now() })
    const crmAgain = await mk(e.crm).run(1, { expectedClass: 'import' })
    expect(crmAgain.outcome).toBe('already_activated')
    const yoboAgain = await mk(e.yobo).run(7, { expectedClass: 'retire' })
    expect(yoboAgain.prepare.ok && yoboAgain.prepare.handoffClass).toBe('retire')
    expect(yoboAgain.outcome).toBe('connect')
    expect(e.fc.stagedHistory).toEqual([A])
    expect(e.fc.users.get(101)!.password).toBe(A)
    expect(e.crm.users.get(1)!).toMatchObject({ authority: 'connect', password: null })
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'connect', password: null })
    // And a full rerun once both are connect: both already_activated, nothing asked of Connect.
    const hits = e.fc.requests.length
    expect((await mk(e.crm).run(1, { expectedClass: 'import' })).outcome).toBe('already_activated')
    expect((await mk(e.yobo).run(7, { expectedClass: 'retire' })).outcome).toBe('already_activated')
    expect(e.fc.requests.length).toBe(hits)
  })

  it("AC6/AC9 — crm's activate withheld: yobo classifies retire (staged row exists), activate-existing answers canonical_pending until crm's activate lands; the row stays fenced, nothing released", async () => {
    e.fc.withhold.add('handoff/activate')
    const crmRun = await e.driver(e.crm).run(1, { expectedClass: 'import' })
    expect(crmRun.outcome).toBe('connect_unreachable')
    expect(e.crm.users.get(1)!.authority).toBe('fenced')
    expect(e.fc.staged.get(101)?.verifier).toBe(A)
    // yobo, forced on while crm's row is stuck.
    const yoboRun = await e.driver(e.yobo).run(7, { expectedClass: 'retire' })
    expect(yoboRun.prepare.ok && yoboRun.prepare.handoffClass).toBe('retire')
    expect(yoboRun.outcome).toBe('canonical_pending')
    expect(e.yobo.users.get(7)!.authority).toBe('fenced') // no new local session
    const yrow = e.yobo.openRow(7)!
    expect(yrow.state).toBe('fenced')
    expect(yrow.attempts).toBe(1)
    expect(new Date(yrow.nextAttemptAt).getTime()).toBe(e.clock.t + 5_000)
    expect(e.fc.hits['handoff/fail'] ?? 0).toBe(0)
    expect(kinds(e.events)).toContain('canonical_pending')
    // The reconciler retries and still waits (backoff doubles), never fails it.
    e.clock.t += 5_000
    const rep1 = await reconcile({ adapter: e.yobo, transport: e.transport('yobo'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep1.items[0]?.outcome).toBe('canonical_pending')
    expect(e.yobo.openRow(7)!.attempts).toBe(2)
    expect(new Date(e.yobo.openRow(7)!.nextAttemptAt).getTime()).toBe(e.clock.t + 10_000)
    expect(e.yobo.users.get(7)!.authority).toBe('fenced')
    // crm's activate lands (its fix + rerun), then yobo completes on the next pass.
    e.fc.withhold.delete('handoff/activate')
    e.clock.t += 10_000
    const crmRep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(crmRep.items[0]?.outcome).toBe('activated')
    expect(e.fc.users.get(101)!.password).toBe(A)
    const rep2 = await reconcile({ adapter: e.yobo, transport: e.transport('yobo'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep2.items[0]?.outcome).toBe('activated')
    expect(e.yobo.users.get(7)!).toMatchObject({ authority: 'connect', password: null })
    expect(e.fc.stagedHistory).toEqual([A])
  })

  it('AC9 — the reverse order forced (yobo first, expectedClass retire): classify answers import, class_mismatch, nothing written', async () => {
    const r = await e.driver(e.yobo).prepare(7, { expectedClass: 'retire' })
    expect(r).toMatchObject({ ok: false, outcome: 'class_mismatch', detail: { expected: 'retire', answered: 'import' } })
    expect(e.yobo.writes).toBe(0)
    expect(e.yobo.rows.size).toBe(0)
    expect(e.yobo.users.get(7)!.authority).toBe('local')
    expect(e.fc.receipt('yobo', '7')).toBeUndefined()
    expect(e.fc.staged.size).toBe(0)
    expect(e.fc.requests.map((x) => x.route)).toEqual(['handoff/classify'])
  })

  it("AC9 — Connect's password set between classify and handoff/prepare → class_changed → failed → released; the rerun classifies adopt and completes", async () => {
    const d = e.driver(e.crm, { hooks: { afterClassify: async () => { e.fc.users.get(101)!.password = C } } })
    const run = await d.run(1, { expectedClass: 'import' })
    expect(run.outcome).toBe('failed')
    expect(run.prepare.ok && run.prepare.remote).toMatchObject({ outcome: 'failed', detail: { reason: 'class_changed:adopt' } })
    expect(e.crm.users.get(1)!.authority).toBe('local')
    expect([...e.crm.rows.values()][0]).toMatchObject({ state: 'failed', handoffClass: 'import', failedReason: 'class_changed:adopt' })
    expect(e.fc.stagedHistory).toEqual([]) // refused before staging
    const again = await e.driver(e.crm).run(1, { expectedClass: 'adopt' })
    expect(again.prepare.ok && again.prepare.handoffClass).toBe('adopt')
    expect(again.outcome).toBe('connect')
    expect(e.fc.users.get(101)!.password).toBe(C)
    expect(e.crm.users.get(1)!).toMatchObject({ authority: 'connect', password: null })
  })
})

// =============================================================================
// prepare_unacked (AC8) and the reconciler's re-post
// =============================================================================

describe('AC8 — a prepared row whose handoff/prepare failed', () => {
  it('fence refused prepare_unacked; the reconciler re-posts once, Connect answers idempotently, nothing staged twice, then the fence passes', async () => {
    e.fc.withhold.add('handoff/prepare')
    const r = await e.driver(e.crm).prepare(1, { expectedClass: 'import' })
    expect(r.ok && r.remote.outcome).toBe('connect_unreachable')
    const row = e.crm.openRow(1)!
    expect(row.prepareAckedAt).toBeNull()
    expect(row.state).toBe('prepared')
    const fenceCallsBefore = e.crm.fenceCalls
    const f = await e.driver(e.crm).fence(1)
    expect(f).toMatchObject({ ok: false, outcome: 'refused', detail: { why: 'prepare_unacked' } })
    expect(e.crm.fenceCalls).toBe(fenceCallsBefore) // refused before the adapter is asked
    expect(e.crm.openRow(1)!.state).toBe('prepared')
    // The M5 trigger would refuse the transition too — the fake enforces it.
    await expect(e.crm.handoffTable.transition(row.handoffId, 'fenced')).rejects.toThrow(/prepare_acked_at IS NULL/)
    // Now Connect is back; the reconciler re-posts exactly once.
    e.fc.withhold.delete('handoff/prepare')
    e.clock.t += 6_000
    const prepareHitsBefore = e.fc.hits['handoff/prepare'] ?? 0
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now(), log: (ev) => e.events.push(ev) })
    expect((e.fc.hits['handoff/prepare'] ?? 0) - prepareHitsBefore).toBe(1)
    expect(e.fc.stagedHistory).toEqual([A])
    expect(kinds(e.events)).toContain('prepare_acked')
    expect(rep.items[0]?.outcome).toBe('activated')
    expect(e.crm.users.get(1)!.authority).toBe('connect')
    // A second reconcile pass has nothing to do and posts nothing.
    const total = e.fc.requests.length
    const rep2 = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep2).toMatchObject({ examined: 0, remaining: 0 })
    expect(e.fc.requests.length).toBe(total)
  })
})

// =============================================================================
// The reconciler proper (AC7 second half, skipped_in_flight, remaining)
// =============================================================================

describe('reconciler', () => {
  it('resumes a prepared row without ever setting operatorCutover (spy) and never opens a handoff', async () => {
    const d = e.driver(e.crm, { hooks: { afterPrepareAck: async () => { throw new Crash('ack') } } })
    await expect(d.prepare(1, { expectedClass: 'import' })).rejects.toThrow()
    const seen: unknown[] = []
    const rep = await reconcile({
      adapter: e.crm,
      transport: e.transport('crm'),
      connectEnabled: false,
      now: () => e.clock.now(),
      driverFactory: (opts) => {
        seen.push(opts.operatorCutover)
        return createHandoffDriver(opts)
      },
    })
    expect(seen).toEqual([undefined])
    expect(rep.items[0]?.outcome).toBe('activated')
    expect(e.fc.hits['handoff/classify']).toBe(1) // the driver's; the reconciler classified nothing
    expect(e.fc.hits['identity/register'] ?? 0).toBe(0) // the sweep is not the reconciler's
  })

  it('a row held by a live driver step is skipped_in_flight (SKIP LOCKED) and stepped on the next pass', async () => {
    const d = e.driver(e.crm, { hooks: { afterPrepareAck: async () => { throw new Crash('ack') } } })
    await expect(d.prepare(1, { expectedClass: 'import' })).rejects.toThrow()
    let release!: () => void
    const gate = new Promise<void>((r) => { release = r })
    e.crm.onFence = async () => gate
    const live = e.driver(e.crm).fence(1) // the driver holds the row inside its fence
    await new Promise((r) => setTimeout(r, 20))
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep).toMatchObject({ examined: 0, skippedInFlight: 0 }) // not even claimed: listDue skipped it
    expect(rep.remaining).toBe(0)
    release()
    e.crm.onFence = null
    expect((await live).outcome).toBe('fenced')
    // `in_flight` from a step counts as skipped too.
    e.crm.held.add(e.crm.openRow(1)!.handoffId)
    const heldRow = e.crm.openRow(1)!
    const inFlight = await createHandoffDriver({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() }).resume(heldRow)
    expect(inFlight.outcome).toBe('in_flight')
    e.crm.held.clear()
    const rep2 = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep2.items[0]?.outcome).toBe('activated')
  })

  it('over 25 open rows answers remaining 15 after one call of 10', async () => {
    for (let i = 10; i < 35; i += 1) {
      e.crm.addUser({ id: i, connectSub: String(100 + i), password: bcryptLike(`h${i}`) })
      e.fc.addUser({ id: 100 + i })
      e.fc.bind('crm', String(i), 100 + i)
      const r = await e.driver(e.crm).prepare(i, { expectedClass: 'import' })
      expect(r.ok).toBe(true)
      e.clock.t += 1
    }
    expect((await e.crm.state()).openHandoffs).toBe(25)
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.examined).toBe(10)
    expect(rep.remaining).toBe(15)
    expect(rep.items.every((i) => i.outcome === 'activated')).toBe(true)
    const rep2 = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep2.remaining).toBe(5)
    const rep3 = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep3).toMatchObject({ examined: 5, remaining: 0 })
  })
})

// =============================================================================
// The mapping sweep (AC10)
// =============================================================================

describe('AC10 — sweepMappings (D25)', () => {
  it('unmapped binding → identity/register { sub, sourceUserRef } → markMapped; 5xx → retried next call, never marked; 409 ref_conflict → logged, left; reconcile never registers', async () => {
    e.crm.addUser({ id: 2, connectSub: '102' })
    e.fc.addUser({ id: 102 })
    e.crm.addUser({ id: 3, connectSub: '103' })
    e.fc.addUser({ id: 103 })
    e.fc.map.set('crm:3', 999) // the ref is already mapped to a different user
    e.crm.users.get(1)!.connectMappedAt = e.clock.now().toISOString()
    const log: unknown[] = []
    // 5xx first: nothing marked.
    e.fc.registerStatusOverride = 503
    let rep = await sweepMappings({ adapter: e.crm, transport: e.transport('crm'), limit: 10, log: (ev) => log.push(ev) })
    expect(rep).toEqual({ registered: 0, conflicts: 0, failed: 2, refused: 0 })
    expect(e.crm.users.get(2)!.connectMappedAt).toBeNull()
    expect(e.crm.users.get(3)!.connectMappedAt).toBeNull()
    // Next call: 2 registers, 3 conflicts and is left.
    e.fc.registerStatusOverride = null
    rep = await sweepMappings({ adapter: e.crm, transport: e.transport('crm'), limit: 10, log: (ev) => log.push(ev) })
    expect(rep).toEqual({ registered: 1, conflicts: 1, failed: 0, refused: 0 })
    expect(e.crm.users.get(2)!.connectMappedAt).not.toBeNull()
    expect(e.crm.users.get(3)!.connectMappedAt).toBeNull()
    expect(e.fc.map.get('crm:3')).toBe(999) // never rebound
    expect(e.fc.map.get('crm:2')).toBe(102)
    const reg = e.fc.requests.filter((r) => r.route === 'identity/register')
    expect(reg.map((r) => r.body)).toEqual([{ sub: '102', sourceUserRef: '2' }, { sub: '103', sourceUserRef: '3' }, { sub: '102', sourceUserRef: '2' }, { sub: '103', sourceUserRef: '3' }])
    expect(reg.every((r) => r.operator === null)).toBe(true) // RP key alone, no operator token
    expect(log).toContainEqual(expect.objectContaining({ kind: 'ref_conflict', userId: 3 }))
    // The adapter's own op delegates to the same function; a third call finds only the conflict.
    e.crm.transportForSweep = e.transport('crm')
    expect(await e.crm.sweepMappings(10)).toEqual({ registered: 0, conflicts: 1 })
    // reconcile() never calls identity/register.
    const before = e.fc.hits['identity/register']
    await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(e.fc.hits['identity/register']).toBe(before)
  })
})

// =============================================================================
// Leases over the fake adapter (AC11's driver half) — the real-Postgres proof is lease.test.ts
// =============================================================================

describe('AC11 — the orphaned request and the drained lease (driver half)', () => {
  it('a prepare paused after classify, before its local insert, while the leases drain → the insert rolls back op_expired; the adapter saw no write; Connect holds nothing', async () => {
    const d = e.driver(e.crm, { hooks: { afterClassify: async () => { await e.crm.drain() } } })
    const r = await d.prepare(1, { expectedClass: 'import' })
    expect(r).toEqual({ ok: false, handoff: null, outcome: 'op_expired' })
    expect(e.crm.writes).toBe(0)
    expect(e.crm.rows.size).toBe(0)
    expect(e.crm.users.get(1)!.authority).toBe('local')
    expect(e.fc.hits['handoff/prepare'] ?? 0).toBe(0)
    expect(e.fc.receipt('crm', '1')).toBeUndefined()
    expect(kinds(e.events)).toContain('op_expired')
  })

  it("a prepare paused after its local insert while the operator jti rotates → handoff/prepare refused operator_superseded; the op writes nothing further; the row stays prepared+unacked for the abort's release", async () => {
    const writesAfterInsert: number[] = []
    const d = e.driver(e.crm, {
      hooks: {
        afterLocalInsert: async () => {
          writesAfterInsert.push(e.crm.writes)
          e.fc.jti = 'J2' // the lift rotated the switch; our transport still sends J1
          await e.crm.drain() // and drained every RP
        },
      },
    })
    const r = await d.prepare(1, { expectedClass: 'import' })
    expect(r.ok && r.remote).toMatchObject({ ok: false, outcome: 'operator_superseded' })
    expect(e.fc.requests.at(-1)).toMatchObject({ route: 'handoff/prepare', status: 403, operator: 'J1' })
    expect(e.crm.writes).toBe(writesAfterInsert[0]) // nothing after the insert
    const row = e.crm.openRow(1)!
    expect(row).toMatchObject({ state: 'prepared', prepareAckedAt: null })
    expect(e.fc.receipt('crm', '1')).toBeUndefined()
    expect(e.fc.staged.size).toBe(0)
    // Any later write under the drained lease is op_expired too.
    await expect(e.crm.handoffTable.transition(row.handoffId, 'prepared', { prepareAckedAt: e.clock.now().toISOString() })).rejects.toMatchObject({ code: 'op_expired' })
    expect(e.crm.openRow(1)!.prepareAckedAt).toBeNull()
    // The abort's release (a fresh lease and the rotated token) returns the row to local.
    e.crm.lease.alive = true
    e.token.current = 'J2'
    const rel = await e.driver(e.crm).release(1, 'abort')
    expect(rel.outcome).toBe('released')
    expect(e.crm.users.get(1)!.authority).toBe('local')
    expect(e.fc.requests.at(-1)).toMatchObject({ route: 'handoff/fail', status: 200 })
  })

  it('fence and activate answer op_expired when the lease is gone, with nothing written', async () => {
    await e.driver(e.crm).prepare(1, { expectedClass: 'import' })
    await e.crm.drain()
    const writes = e.crm.writes
    expect(await e.driver(e.crm).fence(1)).toMatchObject({ outcome: 'op_expired' })
    expect(await e.driver(e.crm).activate(1)).toMatchObject({ outcome: 'refused' }) // still prepared: not fenced
    expect(e.crm.writes).toBe(writes)
    expect(e.crm.openRow(1)!.state).toBe('prepared')
    const rep = await reconcile({ adapter: e.crm, transport: e.transport('crm'), connectEnabled: false, now: () => e.clock.now() })
    expect(rep.opExpired).toBe(true)
    expect(rep.examined).toBe(0)
  })
})

// =============================================================================
// Transport pins
// =============================================================================

describe('transport', () => {
  it('sends the RP key, the system and the operator token; no token when the provider answers null; identity/register never carries one', async () => {
    const t = e.transport('yobo')
    await t.state({ sourceUserRef: '7' })
    expect(e.fc.requests.at(-1)).toMatchObject({ route: 'handoff/state', system: 'yobo', operator: 'J1' })
    e.token.current = null
    await t.state({ sourceUserRef: '7' })
    expect(e.fc.requests.at(-1)!.operator).toBeNull()
    e.token.current = 'J1'
    await t.identityRegister({ sub: '101', sourceUserRef: '7' })
    expect(e.fc.requests.at(-1)).toMatchObject({ route: 'identity/register', operator: null })
    const closed = createHandoffTransport({ issuer: 'http://127.0.0.1:1', rpKey: 'k', system: 'crm', timeoutMs: 500 })
    const r = await closed.state({ sourceUserRef: '1' })
    expect(r.status).toBe(0)
    expect(r.error).toBeTruthy()
  })
})
