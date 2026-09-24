/**
 * p77 follow-up (FIX-connect-followups) — P77-20: the SDK's manifest
 * prediction and Connect's `handoff/classify` consume ONE decision table.
 *
 * WHY. yobo-auth's `decideHandoffClass` (src/server/lib/handoff-class-rule.ts)
 * is the rule Connect runs; STORY-014 made yobo-auth's manifest builder
 * replay it and proved 0 disagreements over a 44-row decision table, driven
 * through the REAL receiver on a real Postgres. `@jetdevs/connect/cutover`'s
 * `classifyPerson` used to carry the older D10 prose and disagreed in two
 * places. This suite runs THAT SAME TABLE — copied verbatim from the
 * STORY-014 AC6 run (results/STORY-014.md, "P77-20 decision table",
 * yobo_auth_test_037) — through the SDK and demands zero disagreements.
 *
 * THE STATES. `pw` = Connect's users.password IS NOT NULL; `receipt` = an
 * activated established_canonical receipt of a PRIOR crm row of the same user
 * (not the crm row under test, not the yobo row); `staged` = a staged row of
 * that prior crm row; `own_staged` = a staged row of the crm row under test
 * itself. The column `connect=` is what Connect's classifyHandoff answered
 * when the sequential driver reached that RP (crm pass, then yobo pass). The
 * 12 combinations STORY-014 asserted UNREACHABLE (pw+staged, receipt+staged,
 * all three — the DB refuses them) have no Connect answer and are not in the
 * table.
 */
import { describe, expect, it } from 'vitest'

import { classifyPerson, decideHandoffClass, type CutoverPlan, type PersonConnectFacts, type PersonRpRow } from '../classify.js'

const PLAN: CutoverPlan = { order: ['crm', 'yobo'], pilots: ['commerce', 'superhost'] }

/** Verbatim from the STORY-014 AC6 run (yobo-auth 9858762, P77-20 decision table). */
const TABLE = `
  pw=0 receipt=0 staged=0 crm=none yobo=none   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=0 crm=none yobo=hash   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=0 crm=hash yobo=none   crm   manifest=import   connect=import   activated
  pw=0 receipt=0 staged=0 crm=hash yobo=hash   crm   manifest=import   connect=import   activated
  pw=0 receipt=0 staged=1 crm=none yobo=none   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=1 crm=none yobo=hash   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=1 crm=hash yobo=none   crm   manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=0 staged=1 crm=hash yobo=hash   crm   manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=1 staged=0 crm=none yobo=none   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=1 staged=0 crm=none yobo=hash   crm   manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=1 staged=0 crm=hash yobo=none   crm   manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=1 staged=0 crm=hash yobo=hash   crm   manifest=retire   connect=retire   canonical_pending
  pw=1 receipt=0 staged=0 crm=none yobo=none   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=none yobo=hash   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=hash yobo=none   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=hash yobo=hash   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=none yobo=none   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=none yobo=hash   crm   manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=hash yobo=none   crm   manifest=retire   connect=retire   activated
  pw=1 receipt=1 staged=0 crm=hash yobo=hash   crm   manifest=retire   connect=retire   activated
  own_staged crm=hash yobo=none                crm   manifest=import   connect=import   activated
  own_staged crm=hash yobo=hash                crm   manifest=import   connect=import   activated
  pw=0 receipt=0 staged=0 crm=none yobo=none   yobo  manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=0 crm=none yobo=hash   yobo  manifest=import   connect=import   activated
  pw=0 receipt=0 staged=0 crm=hash yobo=none   yobo  manifest=adopt    connect=adopt    activated
  pw=0 receipt=0 staged=0 crm=hash yobo=hash   yobo  manifest=retire   connect=retire   activated
  pw=0 receipt=0 staged=1 crm=none yobo=none   yobo  manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=1 crm=none yobo=hash   yobo  manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=0 staged=1 crm=hash yobo=none   yobo  manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=0 staged=1 crm=hash yobo=hash   yobo  manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=1 staged=0 crm=none yobo=none   yobo  manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=1 staged=0 crm=none yobo=hash   yobo  manifest=retire   connect=retire   canonical_pending
  pw=0 receipt=1 staged=0 crm=hash yobo=none   yobo  manifest=recover  connect=recover  no_connect_credential_yet
  pw=0 receipt=1 staged=0 crm=hash yobo=hash   yobo  manifest=retire   connect=retire   canonical_pending
  pw=1 receipt=0 staged=0 crm=none yobo=none   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=none yobo=hash   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=hash yobo=none   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=0 staged=0 crm=hash yobo=hash   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=none yobo=none   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=none yobo=hash   yobo  manifest=retire   connect=retire   activated
  pw=1 receipt=1 staged=0 crm=hash yobo=none   yobo  manifest=adopt    connect=adopt    activated
  pw=1 receipt=1 staged=0 crm=hash yobo=hash   yobo  manifest=retire   connect=retire   activated
  own_staged crm=hash yobo=none                yobo  manifest=adopt    connect=adopt    activated
  own_staged crm=hash yobo=hash                yobo  manifest=retire   connect=retire   activated
`

interface Line {
  state: string
  pre: { pw: boolean; receipt: boolean; staged: boolean } | 'own_staged'
  crm: boolean
  yobo: boolean
  rp: 'crm' | 'yobo'
  manifest: string
  connect: string
}

function parse(table: string): Line[] {
  return table
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .map((l) => {
      const m = /^(?:(own_staged)|pw=(\d) receipt=(\d) staged=(\d)) crm=(hash|none) yobo=(hash|none)\s+(crm|yobo)\s+manifest=(\w+)\s+connect=(\w+)/.exec(l)
      if (!m) throw new Error(`unparseable fixture line: ${l}`)
      const pre = m[1] ? ('own_staged' as const) : { pw: m[2] === '1', receipt: m[3] === '1', staged: m[4] === '1' }
      const state = `${m[1] ? 'own_staged' : `pw=${m[2]} receipt=${m[3]} staged=${m[4]}`} crm=${m[5]} yobo=${m[6]}`
      return { state, pre, crm: m[5] === 'hash', yobo: m[6] === 'hash', rp: m[7] as 'crm' | 'yobo', manifest: m[8]!, connect: m[9]! }
    })
}

const CRM_REF = '1'
const PRIOR_CRM_REF = '99' // the prior crm row the receipt / staged row belongs to
const YOBO_REF = '7'

const rpRow = (system: 'crm' | 'yobo', ref: string, verifier: boolean): PersonRpRow => ({
  system,
  sourceUserRef: ref,
  email: 'p77-20@example.test',
  hasVerifier: verifier,
  passwordDigest: verifier ? (system === 'crm' ? 'a' : 'b').repeat(64) : null,
  passwordRevision: '2026-09-24T00:00:00.000Z',
  isActive: true,
  credentialAuthority: 'local',
  connectSub: '101',
  orgMemberships: 1,
})

/** Connect's facts for a state. `owners: false` = the caller only reports booleans (owner unknown). */
function factsFor(pre: Line['pre'], owners: boolean): PersonConnectFacts {
  if (pre === 'own_staged') return { connectUserId: 101, passwordPresent: false, establishedReceipt: false, stagedRow: true, stagedBy: { system: 'crm', sourceUserRef: CRM_REF } }
  const prior = { system: 'crm', sourceUserRef: PRIOR_CRM_REF }
  return {
    connectUserId: 101,
    passwordPresent: pre.pw,
    establishedReceipt: pre.receipt,
    stagedRow: pre.staged,
    ...(owners ? { establishedBy: pre.receipt ? [prior] : [], stagedBy: pre.staged ? prior : null } : {}),
  }
}

describe('P77-20 — the SDK manifest and Connect agree on ONE decision table', () => {
  const lines = parse(TABLE)

  it('the fixture is the full STORY-014 table: 22 reachable states × 2 RPs = 44 rows, and its manifest column already equals Connect', () => {
    expect(lines).toHaveLength(44)
    expect(new Set(lines.map((l) => l.state)).size).toBe(22)
    expect(lines.filter((l) => l.manifest !== l.connect)).toEqual([])
  })

  it('classifyPerson (the sequential replay) predicts Connect’s answer for every row — 0 disagreements, with owners reported', () => {
    const disagreements: string[] = []
    for (const l of lines) {
      const p = classifyPerson('p77-20@example.test', [rpRow('yobo', YOBO_REF, l.yobo), rpRow('crm', CRM_REF, l.crm)], factsFor(l.pre, true), PLAN)
      const got = p.rows.find((r) => r.system === l.rp)!.class
      if (got !== l.connect) disagreements.push(`${l.state} ${l.rp}: sdk=${got} connect=${l.connect}`)
      // canonicalSource is an OUTPUT of the rule: the system predicted import, else null.
      expect(p.canonicalSource).toBe(p.rows.find((r) => r.class === 'import')?.system ?? null)
    }
    expect(disagreements).toEqual([])
  })

  it('the same table with owner-less booleans (a receipt / staged row of an unknown row counts as elsewhere) — 0 disagreements', () => {
    const disagreements: string[] = []
    for (const l of lines.filter((x) => x.pre !== 'own_staged')) {
      const p = classifyPerson('p77-20@example.test', [rpRow('crm', CRM_REF, l.crm), rpRow('yobo', YOBO_REF, l.yobo)], factsFor(l.pre, false), PLAN)
      const got = p.rows.find((r) => r.system === l.rp)!.class
      if (got !== l.connect) disagreements.push(`${l.state} ${l.rp}: sdk=${got} connect=${l.connect}`)
    }
    expect(disagreements).toEqual([])
  })

  it('decideHandoffClass is yobo-auth’s ordered rule over all 16 fact combinations', () => {
    for (const hasVerifier of [false, true])
      for (const passwordPresent of [false, true])
        for (const stagedElsewhere of [false, true])
          for (const establishedElsewhere of [false, true]) {
            const expected = hasVerifier && (stagedElsewhere || establishedElsewhere) ? 'retire' : passwordPresent ? 'adopt' : hasVerifier ? 'import' : 'recover'
            expect(decideHandoffClass({ hasVerifier, passwordPresent, stagedElsewhere, establishedElsewhere })).toBe(expected)
          }
  })

  it('the two cases the old D10 prose got wrong now match Connect: verifier + Connect password without receipt → adopt; verifier-less crm before a yobo source → recover', () => {
    const a = classifyPerson('x@example.test', [rpRow('crm', CRM_REF, true), rpRow('yobo', YOBO_REF, false)], factsFor({ pw: true, receipt: false, staged: false }, true), PLAN)
    expect(a.rows.map((r) => [r.system, r.class])).toEqual([['crm', 'adopt'], ['yobo', 'adopt']])
    const b = classifyPerson('x@example.test', [rpRow('crm', CRM_REF, false), rpRow('yobo', YOBO_REF, true)], factsFor({ pw: false, receipt: false, staged: false }, true), PLAN)
    expect(b.rows.map((r) => [r.system, r.class])).toEqual([['crm', 'recover'], ['yobo', 'import']])
    expect(b.canonicalSource).toBe('yobo')
  })

  it('a deactivate-allowlist row is never driven, so it never becomes the source', () => {
    const p = classifyPerson('x@example.test', [{ ...rpRow('crm', CRM_REF, true), deactivate: true }, rpRow('yobo', YOBO_REF, true)], factsFor({ pw: false, receipt: false, staged: false }, true), PLAN)
    expect(p.rows.map((r) => [r.system, r.class])).toEqual([['crm', 'linked'], ['yobo', 'import']])
    expect(p.canonicalSource).toBe('yobo')
  })
})
