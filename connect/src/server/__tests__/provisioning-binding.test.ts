// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { ConnectProvisioningClient } from '../index.js'

const make = (fetchImpl: typeof fetch) => new ConnectProvisioningClient({ baseUrl: 'https://connect.example/', internalApiKey: 'private-key', fetchImpl })
afterEach(() => { vi.restoreAllMocks() })
it('posts only snapshotted sub to the caller-scoped path and sanitizes the result', async () => {
  let respond!: (res: Response) => void
  const fetchImpl = vi.fn((_url, _options) => new Promise<Response>((resolve) => { respond = resolve }))
  const args = { sub: '7', clientId: 'evil', sourceSystem: 'other', password: 'discard' }
  const pending = make(fetchImpl).getClientOrgBinding(args)
  args.sub = '8'
  respond(Response.json({ sub: '7', orgId: 31, password: 'discard', clientId: 'discard' }))
  await expect(pending).resolves.toEqual({ sub: '7', orgId: 31 })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl).toHaveBeenCalledWith('https://connect.example/api/internal/client-org-binding/get', expect.objectContaining({
    method: 'POST', redirect: 'error', body: '{"sub":"7"}', signal: expect.any(AbortSignal),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Internal-API-Key': 'private-key' },
  }))
})
it.each([null, 1, 2147483647])('accepts orgId %s and exact boundary sub', async (orgId) => {
  await expect(make(async () => Response.json({ sub: '2147483647', orgId })).getClientOrgBinding({ sub: '2147483647' })).resolves.toEqual({ sub: '2147483647', orgId })
})
it.each([null, undefined, {}, [], { sub: 7 }, ...['', '0', '01', '-1', '+7', ' 7', '7 ', '7\n', '7\r', '1e2', '7.0', '2147483648'].map((sub) => ({ sub }))])('refuses invalid input %j before fetch', async (args) => {
  const fetchImpl = vi.fn()
  await expect(make(fetchImpl).getClientOrgBinding(args as { sub: string })).rejects.toMatchObject({ code: 'invalid_body', status: 0 })
  expect(fetchImpl).not.toHaveBeenCalled()
})
it.each([null, [], 'ok', {}, { sub: '8', orgId: 31 }, ...[undefined, '31', 0, -1, 1.2, 2147483648].map((orgId) => ({ sub: '7', orgId }))])('rejects invalid receipt %j', async (body) => {
  await expect(make(async () => Response.json(body)).getClientOrgBinding({ sub: '7' })).rejects.toMatchObject({ code: 'unexpected', status: 200 })
})
it.each([201, 202, 204])('rejects unexpected successful status %s', async (status) => {
  await expect(make(async () => new Response(status === 204 ? null : '{"sub":"7","orgId":31}', { status })).getClientOrgBinding({ sub: '7' })).rejects.toMatchObject({ code: 'unexpected', status })
})
it.each([[401, 'unauthorized'], [403, 'scope_not_permitted'], [400, 'invalid_body'], [404, 'unknown_client'], [503, 'db_unavailable']])('preserves known HTTP %s refusal safely', async (status, code) => {
  const fetchImpl = vi.fn(async () => Response.json({ error: code, detail: 'SECRET SQL private-key' }, { status: Number(status) }))
  const error = await make(fetchImpl).getClientOrgBinding({ sub: '7' }).catch((error: unknown) => error)
  expect(error).toMatchObject({ code, status })
  expect(String(error)).not.toMatch(/SECRET|SQL|private-key/)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it.each([[200, 'not json'], [500, 'SECRET SQL private-key'], [409, '{"error":"SECRET SQL private-key"}']])('sanitizes malformed/unrecognized response %s', async (status, body) => {
  const error = await make(async () => new Response(String(body), { status: Number(status) })).getClientOrgBinding({ sub: '7' }).catch((error: unknown) => error)
  expect(error).toMatchObject({ code: 'unexpected', status })
  expect(String(error)).not.toMatch(/SECRET|SQL|private-key/)
})
it('reports network failure safely without retry', async () => {
  const fetchImpl = vi.fn(async () => { throw new Error('SECRET private-key') })
  const error = await make(fetchImpl).getClientOrgBinding({ sub: '7' }).catch((error: unknown) => error)
  expect(error).toMatchObject({ code: 'unreachable', status: 0 })
  expect(String(error)).not.toMatch(/SECRET|private-key/)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it.each([false, true])('uses a fixed 10000ms budget covering headers and body (body=%s)', async (bodyDelay) => {
  const realTimeout = AbortSignal.timeout.bind(AbortSignal)
  const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(20))
  const fetchImpl = vi.fn(async (_url, options) => {
    const signal = options!.signal!
    const wait = () => new Promise<never>((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    if (!bodyDelay) return wait()
    return { status: 200, json: wait } as unknown as Response
  })
  await expect(make(fetchImpl).getClientOrgBinding({ sub: '7' })).rejects.toMatchObject({ code: 'timeout', status: bodyDelay ? 200 : 0 })
  expect(timeout).toHaveBeenCalledWith(10000)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
