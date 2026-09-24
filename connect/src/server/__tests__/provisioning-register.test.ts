// @vitest-environment node
/**
 * p77 STORY-017 — `ConnectProvisioningClient.registerIdentity` (D25) against a
 * REAL loopback HTTP server (no mocked fetch). The server answers exactly the
 * yobo-auth route contract (`src/app/api/internal/connect/identity/register/route.ts`,
 * STORY-010): 201/200 `{ ok, created }`, 409 `ref_conflict` / `subject_inactive`,
 * 404 `subject_unknown`, 400/401/403/503 — and a few answers outside it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  ConnectProvisioningClient,
  isConnectIdentityRegisterError,
  isIdentityRefConflict,
} from '../index.js'

interface Seen {
  method: string
  path: string
  key: string | undefined
  operator: string | undefined
  body: unknown
}
const seen: Seen[] = []
/** The next answer: status + raw body text (so malformed bodies can be sent). */
let next: { status: number; body: string; delayMs?: number } = { status: 201, body: '{"ok":true,"created":true}' }

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    let body: unknown = raw
    try {
      body = JSON.parse(raw)
    } catch {
      /* keep raw */
    }
    seen.push({
      method: req.method ?? '',
      path: req.url ?? '',
      key: req.headers['x-internal-api-key'] as string | undefined,
      operator: req.headers['x-cutover-operator'] as string | undefined,
      body,
    })
    const answer = next
    setTimeout(() => {
      res.statusCode = answer.status
      res.setHeader('content-type', 'application/json')
      res.end(answer.body)
    }, answer.delayMs ?? 0)
  })
})
let base = ''

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  server.closeAllConnections?.()
  await new Promise<void>((r) => server.close(() => r()))
})
beforeEach(() => {
  seen.length = 0
})

const client = (over: { registerTimeoutMs?: number } = {}) =>
  new ConnectProvisioningClient({ baseUrl: `${base}/`, internalApiKey: 'rp-key-commerce', ...over })

async function refusal(p: Promise<unknown>) {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected a refusal')
}

describe('ConnectProvisioningClient.registerIdentity (p77 D25, real loopback HTTP)', () => {
  it('201 → { created: true }; sends { sub, sourceUserRef } to identity/register with the RP key and no operator token', async () => {
    next = { status: 201, body: JSON.stringify({ ok: true, created: true }) }
    await expect(client().registerIdentity({ sub: '42', sourceUserRef: '7' })).resolves.toEqual({ created: true })
    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual({
      method: 'POST',
      path: '/api/internal/connect/identity/register',
      key: 'rp-key-commerce',
      operator: undefined,
      body: { sub: '42', sourceUserRef: '7' },
    })
  })

  it('200 → { created: false } (idempotent re-registration)', async () => {
    next = { status: 200, body: JSON.stringify({ ok: true, created: false }) }
    await expect(client().registerIdentity({ sub: '42', sourceUserRef: '7' })).resolves.toEqual({ created: false })
  })

  it('409 ref_conflict → a typed refusal isIdentityRefConflict recognises', async () => {
    next = { status: 409, body: JSON.stringify({ error: 'ref_conflict' }) }
    const e = await refusal(client().registerIdentity({ sub: '42', sourceUserRef: '7' }))
    expect(isConnectIdentityRegisterError(e)).toBe(true)
    expect(isIdentityRefConflict(e)).toBe(true)
    expect(e).toMatchObject({ code: 'ref_conflict', status: 409, name: 'ConnectIdentityRegisterError' })
  })

  it.each([
    [409, 'subject_inactive'],
    [404, 'subject_unknown'],
    [400, 'invalid_body'],
    [401, 'unauthorized'],
    [403, 'scope_not_permitted'],
    [403, 'source_system_not_permitted'],
    [503, 'db_unavailable'],
  ])('%i %s → refused with that code, never a ref_conflict', async (status, error) => {
    next = { status, body: JSON.stringify({ error }) }
    const e = await refusal(client().registerIdentity({ sub: '42', sourceUserRef: '7' }))
    expect(e).toMatchObject({ code: error, status })
    expect(isIdentityRefConflict(e)).toBe(false)
  })

  it('default-deny: answers outside the contract are refusals (`unexpected`), a 2xx included', async () => {
    for (const a of [
      { status: 200, body: JSON.stringify({ created: true }) }, // no ok:true
      { status: 201, body: 'not json' },
      { status: 204, body: '' },
      { status: 202, body: JSON.stringify({ ok: true }) },
      { status: 200, body: JSON.stringify({ ok: 'true' }) },
      { status: 500, body: '<html>boom</html>' },
      { status: 409, body: JSON.stringify({ error: 'made_up_code' }) },
      { status: 200, body: JSON.stringify({ error: 'ref_conflict' }) }, // a 2xx never carries a refusal code
    ]) {
      next = a
      const e = await refusal(client().registerIdentity({ sub: '42', sourceUserRef: '7' }))
      expect(e, `${a.status} ${a.body}`).toMatchObject({ code: 'unexpected', status: a.status })
    }
  })

  it('no answer (closed port, timeout) → `unreachable`, status 0', async () => {
    const dead = new ConnectProvisioningClient({ baseUrl: 'http://127.0.0.1:1', internalApiKey: 'k' })
    await expect(refusal(dead.registerIdentity({ sub: '1', sourceUserRef: '1' }))).resolves.toMatchObject({
      code: 'unreachable',
      status: 0,
    })
    next = { status: 201, body: JSON.stringify({ ok: true, created: true }), delayMs: 400 }
    await expect(refusal(client({ registerTimeoutMs: 50 }).registerIdentity({ sub: '1', sourceUserRef: '1' }))).resolves.toMatchObject({
      code: 'unreachable',
      status: 0,
    })
  })
})
