// @vitest-environment node
/**
 * p131 INV-002 — `InvitesClient`: sends X-Internal-API-Key on every call and
 * never accepts or sends a password (I1).
 */
import { describe, expect, it } from 'vitest'
import { ConnectInvitesError, InvitesClient, type CreateConnectInviteArgs } from '../index.js'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
}

function fakeFetch(answer: { status: number; body: unknown } = { status: 200, body: { ok: true } }) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>)),
      body: init?.body as string | undefined,
    })
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { calls, impl }
}

const ARGS: CreateConnectInviteArgs = {
  email: 'ana@example.com',
  roleRef: '7',
  roleName: 'Admin',
  sourceOrgRef: '42',
  orgName: 'Acme',
  invitedBySub: 'sub-1',
  invitedByName: 'Ira',
  appUrl: 'https://app.example.test/',
}

describe('InvitesClient', () => {
  it('every method sends X-Internal-API-Key to the right path', async () => {
    const { calls, impl } = fakeFetch({ status: 200, body: { invites: [], id: 1, cancelled: 0 } })
    const c = new InvitesClient({ baseUrl: 'https://connect.test/', internalApiKey: 'k-123', fetchImpl: impl })
    await c.create(ARGS)
    await c.list('org 42')
    await c.resend(5)
    await c.cancel(5)
    await c.cancelByEmail({ sourceOrgRef: '42', email: 'ana@example.com' })
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'POST https://connect.test/api/internal/invites',
      'GET https://connect.test/api/internal/invites?orgRef=org%2042',
      'POST https://connect.test/api/internal/invites/5/resend',
      'POST https://connect.test/api/internal/invites/5/cancel',
      'POST https://connect.test/api/internal/invites/cancel-by-email',
    ])
    for (const call of calls) expect(call.headers['X-Internal-API-Key']).toBe('k-123')
  })

  it('never sends a password — a stray password on the args is dropped (I1)', async () => {
    const { calls, impl } = fakeFetch({ status: 201, body: { id: 1 } })
    const c = new InvitesClient({ baseUrl: 'https://connect.test', internalApiKey: 'k', fetchImpl: impl })
    await c.create({ ...ARGS, password: 'hunter2', sourceSystem: 'spoof', clientId: 'spoof' } as unknown as CreateConnectInviteArgs)
    await c.cancelByEmail({ sourceOrgRef: '42', email: 'a@b.co', password: 'x' } as unknown as { sourceOrgRef: string; email: string })
    for (const call of calls) {
      expect(call.body ?? '').not.toMatch(/password|hunter2/i)
      expect(call.body ?? '').not.toMatch(/sourceSystem|clientId/)
    }
    expect(JSON.parse(calls[0]!.body!)).toEqual({ ...ARGS })
  })

  it('the args type has no password field (compile-time I1)', () => {
    // @ts-expect-error — password is not part of the contract
    const bad: CreateConnectInviteArgs = { ...ARGS, password: 'x' }
    expect(bad).toBeTruthy()
  })

  it('non-2xx throws ConnectInvitesError with the route code', async () => {
    const { impl } = fakeFetch({ status: 404, body: { error: 'not_found' } })
    const c = new InvitesClient({ baseUrl: 'https://connect.test', internalApiKey: 'k', fetchImpl: impl })
    await expect(c.cancel(9)).rejects.toMatchObject({ name: 'ConnectInvitesError', status: 404, code: 'not_found' })
  })

  it('network failure throws unreachable', async () => {
    const impl = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    const c = new InvitesClient({ baseUrl: 'https://connect.test', internalApiKey: 'k', fetchImpl: impl })
    const err = await c.list('1').catch((e) => e)
    expect(err).toBeInstanceOf(ConnectInvitesError)
    expect(err.code).toBe('unreachable')
  })
})
