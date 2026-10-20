// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  ConnectProvisioningClient,
  ConnectIdentityDisconnectError,
  isConnectIdentityDisconnectError,
  type DisconnectApplicationIdentityArgs,
  type DisconnectApplicationIdentityResult,
  type ConnectProvisioningConfig,
} from '../index.js'

const input = { sub: '42', sourceUserRef: 'merchant-user-7' }
const success: DisconnectApplicationIdentityResult = {
  status: 'disconnected',
  ...input,
  canonicalIdentityPreserved: true,
  counts: { grantsRevoked: 2, clientBindingsCleared: 1, mappingsRetired: 1 },
}
const seen: { method?: string; path?: string; headers: http.IncomingHttpHeaders; body: unknown }[] = []
let next: { status: number; body: string; delayMs?: number; bodyDelayMs?: number }
const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (chunk) => (raw += chunk))
  req.on('end', () => {
    seen.push({ method: req.method, path: req.url, headers: req.headers, body: JSON.parse(raw) })
    const answer = next
    setTimeout(() => {
      res.writeHead(answer.status, { 'Content-Type': 'application/json' })
      if (answer.bodyDelayMs) {
        res.flushHeaders()
        setTimeout(() => res.end(answer.body), answer.bodyDelayMs)
      } else res.end(answer.body)
    }, answer.delayMs ?? 0)
  })
})
let baseUrl = ''
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
})
afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
beforeEach(() => {
  seen.length = 0
  next = { status: 200, body: JSON.stringify(success) }
})
const client = (config: Partial<ConnectProvisioningConfig> = {}) =>
  new ConnectProvisioningClient({ baseUrl, internalApiKey: 'merchant-rp-key', ...config })

describe('ConnectProvisioningClient.disconnectApplicationIdentity', () => {
  it('posts only sub/ref to the disconnect endpoint with the RP key', async () => {
    const args = { ...input, sourceSystem: 'other-app', clientId: 'other-client', password: 'discard' }
    await expect(client().disconnectApplicationIdentity(args)).resolves.toEqual(success)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({
      method: 'POST',
      path: '/api/internal/connect/identity/disconnect',
      headers: { 'x-internal-api-key': 'merchant-rp-key', 'content-type': 'application/json', accept: 'application/json' },
      body: input,
    })
    expect(seen[0].headers['x-cutover-operator']).toBeUndefined()
    expect(seen[0].headers.authorization).toBeUndefined()
  })

  it('accepts an idempotent retirement with zero counts', async () => {
    const result = {
      ...success,
      status: 'already_disconnected',
      counts: { grantsRevoked: 0, clientBindingsCleared: 0, mappingsRetired: 0 },
    }
    next.body = JSON.stringify(result)
    await expect(client().disconnectApplicationIdentity(input)).resolves.toEqual(result)
  })

  it.each([
    ['accepts the original receipt', { sub: '42', sourceUserRef: 'merchant-user-7' }, true],
    ['rejects a receipt for the mutated input', { sub: '43', sourceUserRef: 'different-ref' }, false],
  ] as const)('%s when caller input changes while fetch is pending', async (_name, receipt, accepted) => {
    let respond!: (response: Response) => void
    let sentBody: unknown
    const sdk = client({
      fetchImpl: (_url, options) => {
        sentBody = JSON.parse(String(options?.body))
        return new Promise<Response>((resolve) => (respond = resolve))
      },
    })
    const args = { ...input }
    const pending = sdk.disconnectApplicationIdentity(args)
    expect(sentBody).toEqual({ sub: '42', sourceUserRef: 'merchant-user-7' })
    args.sub = '43'
    args.sourceUserRef = 'different-ref'
    respond(Response.json({ ...success, ...receipt }))
    if (accepted) await expect(pending).resolves.toEqual(success)
    else await expect(pending).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it('accepts valid input boundaries without trimming the reference', async () => {
    const args = { sub: '2147483647', sourceUserRef: ` ${'a'.repeat(62)} ` }
    next.body = JSON.stringify({ ...success, ...args })
    await expect(client().disconnectApplicationIdentity(args)).resolves.toMatchObject(args)
    expect(seen[0].body).toEqual(args)
  })

  it.each([
    null, undefined, {}, { ...input, sub: 42 },
    ...['', '0', '-1', '+1', '01', ' 42', '42 ', '42\n', '42\r', '42\u2028', '1.1', '1e2', '2147483648', '9007199254740992'].map((sub) => ({ ...input, sub })),
    ...['', ' \t\n', 'a'.repeat(65), null, 7].map((sourceUserRef) => ({ ...input, sourceUserRef })),
  ])('rejects invalid input before any request: %j', async (args) => {
    await expect(client().disconnectApplicationIdentity(args as DisconnectApplicationIdentityArgs)).rejects.toMatchObject({
      name: 'ConnectIdentityDisconnectError', code: 'invalid_body', status: 0,
    })
    expect(seen).toHaveLength(0)
  })

  it.each([
    null, [], 'ok', 42, {},
    { ...success, status: 'deleted' },
    { ...success, sub: '43' },
    { ...success, sub: 42 },
    { ...success, sourceUserRef: 'another-user' },
    { ...success, sourceUserRef: undefined },
    { ...success, canonicalIdentityPreserved: false },
    { ...success, canonicalIdentityPreserved: 'true' },
    { ...success, counts: null },
    { ...success, counts: {} },
    ...['grantsRevoked', 'clientBindingsCleared', 'mappingsRetired'].flatMap((field) =>
      [-1, 0.1, '1', null, undefined, Number.MAX_SAFE_INTEGER + 1].map((count) => ({
        ...success, counts: { ...success.counts, [field]: count },
      })),
    ),
    { error: 'ref_conflict' },
  ])('rejects an invalid success body: %j', async (body) => {
    next.body = JSON.stringify(body)
    await expect(client().disconnectApplicationIdentity(input)).rejects.toMatchObject({ code: 'unexpected', status: 200 })
  })

  it.each([
    [201, JSON.stringify(success)],
    [202, JSON.stringify(success)],
    [204, ''],
    [200, 'not json'],
    [500, '<html>unavailable</html>'],
    [409, JSON.stringify({ error: 'unrecognized_refusal' })],
  ])('rejects HTTP/body outside the contract (%i, %s)', async (status, body) => {
    next = { status, body }
    await expect(client().disconnectApplicationIdentity(input)).rejects.toMatchObject({ code: 'unexpected', status })
    expect(seen).toHaveLength(1)
  })

  it.each([
    [400, 'invalid_body'], [401, 'unauthorized'], [403, 'scope_not_permitted'],
    [403, 'source_system_not_permitted'], [404, 'subject_unknown'], [409, 'subject_inactive'],
    [409, 'ref_conflict'], [409, 'mapping_unknown'], [409, 'client_mismatch'],
    [503, 'maintenance'], [503, 'db_unavailable'],
  ])('preserves the recognized refusal %i %s with no retry', async (status, error) => {
    next = { status, body: JSON.stringify({ error }) }
    await expect(client().disconnectApplicationIdentity(input)).rejects.toMatchObject({
      kind: 'connect_identity_disconnect_error', code: error, status,
    })
    expect(seen).toHaveLength(1)
  })

  it('exposes a stable typed error and duck-typed guard through the server entrypoint', async () => {
    next = { status: 409, body: JSON.stringify({ error: 'mapping_unknown' }) }
    const error = await client().disconnectApplicationIdentity(input).catch((error: unknown) => error)
    expect(error).toBeInstanceOf(ConnectIdentityDisconnectError)
    expect(isConnectIdentityDisconnectError(error)).toBe(true)
    expect(isConnectIdentityDisconnectError({ kind: 'connect_identity_disconnect_error' })).toBe(true)
    expect(isConnectIdentityDisconnectError(null)).toBe(false)
    expect(isConnectIdentityDisconnectError(new Error('other'))).toBe(false)
  })

  it('normalizes network failure to unreachable, status 0', async () => {
    await expect(client({ baseUrl: 'http://127.0.0.1:1' }).disconnectApplicationIdentity(input)).rejects.toMatchObject({
      name: 'ConnectIdentityDisconnectError', code: 'unreachable', status: 0,
    })
  })

  it('bounds the request with its own timeout and never retries', async () => {
    next.delayMs = 300
    await expect(client({ disconnectTimeoutMs: 50 }).disconnectApplicationIdentity(input)).rejects.toMatchObject({
      code: 'timeout', status: 0,
    })
    expect(seen).toHaveLength(1)
  })

  it('bounds body reading too and retains the received HTTP status', async () => {
    next.bodyDelayMs = 300
    await expect(client({ disconnectTimeoutMs: 50 }).disconnectApplicationIdentity(input)).rejects.toMatchObject({
      code: 'timeout', status: 200,
    })
    expect(seen).toHaveLength(1)
  })

  it('does not use registerTimeoutMs for disconnect', async () => {
    next.delayMs = 30
    await expect(client({ registerTimeoutMs: 1 }).disconnectApplicationIdentity(input)).resolves.toEqual(success)
  })
})
