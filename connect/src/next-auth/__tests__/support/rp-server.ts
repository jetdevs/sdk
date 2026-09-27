/**
 * Test support (p77 STORY-005): mount the REAL route handlers of
 * `createConnectInternalRoutes` / `createBackchannelLogoutRoute` on a
 * `node:http` loopback server, exactly as a Next.js route module would bind
 * them — so the estate driver, the lifter and the tests reach them over real
 * HTTP with real `Request` objects. Nothing is mocked.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import type { RouteHandler } from '../../internal-routes.js'

export interface MountedRoutes {
  /** path → handler (POST). */
  [path: string]: RouteHandler
}

export interface RpServer {
  origin: string
  server: Server
  /** Every request seen, in order: path + status. */
  log: Array<{ path: string; status: number }>
  close(): Promise<void>
}

async function toRequest(req: IncomingMessage, origin: string): Promise<Request> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue
    headers.set(k, Array.isArray(v) ? v.join(', ') : v)
  }
  const body = chunks.length ? Buffer.concat(chunks) : null
  return new Request(`${origin}${req.url ?? '/'}`, { method: req.method ?? 'GET', headers, ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}) })
}

async function writeResponse(res: ServerResponse, out: Response): Promise<void> {
  res.statusCode = out.status
  out.headers.forEach((v, k) => res.setHeader(k, v))
  const text = await out.text()
  res.end(text)
}

export async function startRpServer(routes: MountedRoutes, opts: { getRoutes?: Record<string, () => Promise<Response>> } = {}): Promise<RpServer> {
  const log: RpServer['log'] = []
  const server = createServer(async (req, res) => {
    const origin = `http://${req.headers.host ?? '127.0.0.1'}`
    const path = new URL(req.url ?? '/', origin).pathname
    try {
      if (req.method === 'GET' && opts.getRoutes?.[path]) {
        const out = await opts.getRoutes[path]!()
        log.push({ path, status: out.status })
        return await writeResponse(res, out)
      }
      const handler = routes[path]
      if (!handler) {
        log.push({ path, status: 404 })
        res.statusCode = 404
        res.setHeader('content-type', 'application/json')
        return res.end(JSON.stringify({ error: 'not_found' }))
      }
      const out = await handler(await toRequest(req, origin))
      log.push({ path, status: out.status })
      await writeResponse(res, out)
    } catch (err) {
      log.push({ path, status: 500 })
      res.statusCode = 500
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'handler_threw', detail: err instanceof Error ? err.message : String(err) }))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    server,
    log,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}

/** A `Request` to a handler directly (no HTTP): the same shape the server builds. */
export function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
