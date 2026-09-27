/**
 * p77 STORY-004 — the owner client and the RP-side resolver over a REAL
 * loopback Connect (node:http). AC4: an external owner's reset-request
 * forwards exactly once and the caller sees the same silent success.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createConnectOwnerClient, type ConnectOwnerClient } from '../client.js'
import {
  REFUSED_EMAIL_TAKEN,
  REFUSED_FENCED,
  REFUSED_OWNER_UNVERIFIABLE,
  credentialOwnerSummary,
  resolveConnectCredentialOwner,
} from '../resolver.js'
import type { CredentialOwner, ResolveCredentialOwner } from '../types.js'
import { startFakeConnect, type FakeConnect } from '../../handoff/__tests__/support/fake-connect.js'

let fc: FakeConnect
let client: ConnectOwnerClient
const flag = { on: false }

function resolver(extra: Partial<Parameters<typeof resolveConnectCredentialOwner>[2]> = {}, adapter: { readAuthority: (id: number) => Promise<any> } | null = null): ResolveCredentialOwner {
  return resolveConnectCredentialOwner(adapter, { connectEnabled: () => flag.on }, {
    issuer: fc.issuer + '/',
    providerId: 'yobo-connect',
    connectClient: () => client,
    ...extra,
  })
}

beforeEach(async () => {
  fc = await startFakeConnect()
  client = createConnectOwnerClient({ issuer: fc.issuer, rpKey: fc.rpKey, system: 'crm', timeoutMs: 1_000 })
  flag.on = false
})
afterEach(async () => {
  await fc.stop()
})

describe('ConnectOwnerClient', () => {
  it('emailHeld: held / free / unreachable (non-200, malformed, transport)', async () => {
    fc.emailsHeld.add('sean@x.test')
    expect(await client.emailHeld('Sean@x.test'.toLowerCase())).toBe('held')
    expect(await client.emailHeld('nobody@x.test')).toBe('free')
    expect(fc.requests.at(-1)).toMatchObject({ route: 'email-held', system: 'crm', body: { email: 'nobody@x.test' } })
    fc.withhold.add('email-held')
    expect(await client.emailHeld('nobody@x.test')).toBe('unreachable')
    const dead = createConnectOwnerClient({ issuer: 'http://127.0.0.1:1', rpKey: 'k', system: 'crm', timeoutMs: 300 })
    expect(await dead.emailHeld('a@b.test')).toBe('unreachable')
  })

  it('forwardResetRequest posts to the internal reset-forward route once; a non-200 (503 maintenance) throws', async () => {
    await client.forwardResetRequest(' sean@x.test ')
    expect(fc.resetForwards).toEqual(['sean@x.test'])
    expect(fc.requests.at(-1)).toMatchObject({ route: 'reset-forward', operator: null })
    fc.resetForwardStatus = 503
    await expect(client.forwardResetRequest('sean@x.test')).rejects.toThrow(/status 503/)
  })
})

describe('resolveConnectCredentialOwner', () => {
  it('a loaded row decides synchronously: connect → external with accountUrl/resetUrl/loginHint/forwardResetRequest; fenced → frozen; local/prepared → local', async () => {
    const r = resolver()
    const ext = r({ db: null, operation: 'change-password', user: { id: 1, email: 'sean@x.test', credential_authority: 'connect' }, email: null }) as CredentialOwner
    expect(ext).toMatchObject({
      kind: 'external',
      issuer: fc.issuer,
      providerId: 'yobo-connect',
      accountUrl: `${fc.issuer}/account/security`,
      resetUrl: `${fc.issuer}/forgot-password`,
      loginHint: 'sean@x.test',
    })
    expect(typeof (ext as any).forwardResetRequest).toBe('function')
    expect(r({ db: null, operation: 'update', user: { id: 2, credentialAuthority: 'fenced' }, email: 'a@b.test' })).toEqual({ kind: 'frozen', reason: REFUSED_FENCED })
    expect(r({ db: null, operation: 'verify', user: { id: 3, credential_authority: 'local' }, email: null })).toEqual({ kind: 'local' })
    expect(r({ db: null, operation: 'verify', user: { id: 3, credential_authority: 'prepared' }, email: null })).toEqual({ kind: 'local' })
    expect(credentialOwnerSummary(ext)).toEqual({ kind: 'external', accountUrl: `${fc.issuer}/account/security`, resetUrl: `${fc.issuer}/forgot-password` })
    expect(fc.requests).toHaveLength(0) // no network call for a loaded row
  })

  it('a row without the column asks the adapter; an unreadable authority is frozen (fail-closed)', async () => {
    const asked: number[] = []
    const r = resolver({}, { readAuthority: async (id) => { asked.push(id); if (id === 9) throw new Error('down'); return { authority: 'connect' } } })
    expect(await r({ db: null, operation: 'update', user: { id: 4, email: 'x@y.test' }, email: null })).toMatchObject({ kind: 'external', loginHint: 'x@y.test' })
    expect(await r({ db: null, operation: 'update', user: { id: 9 }, email: null })).toEqual({ kind: 'frozen', reason: REFUSED_FENCED })
    expect(asked).toEqual([4, 9])
  })

  it('AC4 — an external owner and operation reset-request: forwardResetRequest is called once; the caller answers the same silent success', async () => {
    const r = resolver()
    const owner = (await r({ db: null, operation: 'reset-request', user: { id: 1, email: 'sean@x.test', credential_authority: 'connect' }, email: 'sean@x.test' })) as Extract<CredentialOwner, { kind: 'external' }>
    expect(owner.kind).toBe('external')
    // What the SDK's reset service does with an external owner: forward, swallow, answer { ok: true }.
    const callerAnswer = await (async () => {
      try {
        await owner.forwardResetRequest!('sean@x.test')
      } catch {
        /* the same silent success either way */
      }
      return { ok: true }
    })()
    expect(callerAnswer).toEqual({ ok: true })
    expect(fc.resetForwards).toEqual(['sean@x.test'])
    expect(fc.requests.filter((q) => q.route === 'reset-forward')).toHaveLength(1)
    // A local request answers the same body and forwards nothing.
    const local = await r({ db: null, operation: 'reset-request', user: { id: 2, credential_authority: 'local' }, email: 'other@x.test' })
    expect(local).toEqual({ kind: 'local' })
    expect(fc.resetForwards).toEqual(['sean@x.test'])
  })

  it('no row: verify / login-form / update / reset-request → none with no network call', async () => {
    const r = resolver()
    for (const operation of ['verify', 'login-form', 'update', 'change-password', 'reset', 'reset-request'] as const) {
      expect(await r({ db: null, operation, user: null, email: 'new@x.test' })).toEqual({ kind: 'none' })
    }
    expect(fc.requests).toHaveLength(0)
  })

  it('no row, allocation, flag ON: email-held is asked — held → external; free → the local D19 check → none; unreachable → frozen (fail-closed)', async () => {
    flag.on = true
    const localHeld = new Set<string>()
    const r = resolver({ emailHeldLocally: async (_db, email) => localHeld.has(email.toLowerCase()) })
    fc.emailsHeld.add('taken@x.test')
    expect(await r({ db: null, operation: 'register', user: null, email: 'taken@x.test' })).toMatchObject({ kind: 'external', loginHint: 'taken@x.test' })
    expect(await r({ db: null, operation: 'invite', user: null, email: 'free@x.test' })).toEqual({ kind: 'none' })
    localHeld.add('dup@x.test')
    expect(await r({ db: null, operation: 'create', user: null, email: 'Dup@x.test' })).toEqual({ kind: 'frozen', reason: REFUSED_EMAIL_TAKEN })
    expect(fc.requests.filter((q) => q.route === 'email-held')).toHaveLength(3)
    fc.withhold.add('email-held')
    expect(await r({ db: null, operation: 'register', user: null, email: 'free@x.test' })).toEqual({ kind: 'frozen', reason: REFUSED_OWNER_UNVERIFIABLE })
    // No client configured with the flag on → frozen too (never a guess).
    const noClient = resolver({ connectClient: () => null })
    expect(await noClient({ db: null, operation: 'register', user: null, email: 'free@x.test' })).toEqual({ kind: 'frozen', reason: REFUSED_OWNER_UNVERIFIABLE })
  })

  it('no row, allocation, flag OFF: Connect is not asked; only the local D19 check runs', async () => {
    flag.on = false
    const r = resolver({ emailHeldLocally: async (_db, email) => email === 'dup@x.test' })
    fc.emailsHeld.add('taken@x.test')
    expect(await r({ db: null, operation: 'register', user: null, email: 'taken@x.test' })).toEqual({ kind: 'none' })
    expect(await r({ db: null, operation: 'register', user: null, email: 'dup@x.test' })).toEqual({ kind: 'frozen', reason: REFUSED_EMAIL_TAKEN })
    expect(fc.requests).toHaveLength(0)
  })

  it('messages are overridable and never name the identity provider by default', async () => {
    const r = resolver({ messages: { fenced: 'Paused.' } })
    expect(r({ db: null, operation: 'update', user: { id: 1, credential_authority: 'fenced' }, email: null })).toEqual({ kind: 'frozen', reason: 'Paused.' })
    for (const m of [REFUSED_FENCED, REFUSED_EMAIL_TAKEN, REFUSED_OWNER_UNVERIFIABLE]) expect(m).not.toMatch(/connect/i)
  })
})
