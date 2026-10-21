// @vitest-environment node
import { createServer, type Server, type RequestListener } from 'node:http'
import { expect, it } from 'vitest'
import { ConnectProvisioningClient } from '../provisioning.js'

// Adapted from the two-origin PR reproduction; use native fetch, not a transport mock.
it.each([307, 308])('disconnect rejects HTTP %s without sending any request to the destination', async (status) => {
  const servers: Server[] = []
  const seen: unknown[] = []
  const listen = async (handler: RequestListener) => {
    const server = createServer(handler); servers.push(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as { port: number }).port}`
  }
  try {
    const destination = await listen((req, res) => {
      seen.push({ headers: req.headers, method: req.method })
      req.resume()
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'disconnected', sub: '42', sourceUserRef: 'old', canonicalIdentityPreserved: true, counts: { grantsRevoked: 0, clientBindingsCleared: 0, mappingsRetired: 1 } }))
    })
    const origin = await listen((req, res) => { req.resume(); res.writeHead(status, { location: `${destination}/foreign-receipt` }); res.end() })
    const client = new ConnectProvisioningClient({ baseUrl: origin, internalApiKey: 'repro-placeholder-key' })
    const result = await client.disconnectApplicationIdentity({ sub: '42', sourceUserRef: 'old' }).catch(error => error)
    expect(seen).toEqual([])
    expect(result).toMatchObject({ code: 'unreachable', status: 0 })
  } finally {
    await Promise.all(servers.map(server => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())) }))
  }
})
