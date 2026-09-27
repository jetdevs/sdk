/**
 * Test support (p77 follow-up FIX-connect-followups): a minimal WebSocket →
 * TCP proxy, so the REAL @neondatabase/serverless driver (Pool / Client over
 * WebSockets — what superhost-app runs on Vercel) can reach the LOCAL
 * Postgres. It plays the part Neon's edge proxy (or `wsproxy`) plays in
 * production: every binary WebSocket message is Postgres wire bytes, both
 * ways, untouched.
 *
 * The driver is pointed at it with
 *   neonConfig.wsProxy = (host, port) => `127.0.0.1:<proxyPort>/v1?address=${host}:${port}`
 *   neonConfig.useSecureWebSocket = false; neonConfig.pipelineConnect = false
 * and forceDisablePgSSL stays at its default (true) — the local server does
 * not do TLS.
 *
 * RFC 6455 subset: the opening handshake, masked client frames (text / binary
 * / continuation / close / ping), unmasked binary server frames. Refuses any
 * target host that is not loopback. No dependency — Node 22 has a WebSocket
 * CLIENT built in but no server, and this package has no `ws`.
 */
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { connect as tcpConnect, type Socket } from 'node:net'

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1'])

export interface WsPgProxy {
  port: number
  /** WebSocket connections accepted so far. */
  connections(): number
  close(): Promise<void>
}

function frame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length
  let head: Buffer
  if (len < 126) {
    head = Buffer.from([0x80 | opcode, len])
  } else if (len < 65536) {
    head = Buffer.alloc(4)
    head[0] = 0x80 | opcode
    head[1] = 126
    head.writeUInt16BE(len, 2)
  } else {
    head = Buffer.alloc(10)
    head[0] = 0x80 | opcode
    head[1] = 127
    head.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([head, payload])
}

export async function startWsPgProxy(): Promise<WsPgProxy> {
  let accepted = 0
  const sockets = new Set<Socket>()
  const server: Server = createServer((_req, res) => {
    res.writeHead(426).end()
  })

  server.on('upgrade', (req: IncomingMessage, ws: Socket, head: Buffer) => {
    sockets.add(ws)
    ws.on('close', () => sockets.delete(ws))
    const url = new URL(req.url ?? '/', 'http://proxy')
    const address = url.searchParams.get('address') ?? ''
    const i = address.lastIndexOf(':')
    const host = address.slice(0, i)
    const port = Number(address.slice(i + 1))
    const key = req.headers['sec-websocket-key']
    if (!key || !LOOPBACK.has(host) || !Number.isInteger(port)) {
      ws.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    accepted += 1
    const accept = createHash('sha1').update(`${key}${GUID}`).digest('base64')
    ws.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)

    const pg = tcpConnect(port, host)
    sockets.add(pg)
    pg.on('close', () => {
      sockets.delete(pg)
      if (!ws.destroyed) ws.end(frame(0x8, Buffer.alloc(0)))
    })
    pg.on('error', () => ws.destroy())
    ws.on('error', () => pg.destroy())
    ws.on('close', () => pg.destroy())
    pg.on('data', (chunk: Buffer) => {
      if (!ws.destroyed) ws.write(frame(0x2, chunk))
    })

    let buf: Buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0)
    const drain = () => {
      for (;;) {
        if (buf.length < 2) return
        const b0 = buf[0]!
        const b1 = buf[1]!
        const opcode = b0 & 0x0f
        const masked = (b1 & 0x80) !== 0
        let len = b1 & 0x7f
        let off = 2
        if (len === 126) {
          if (buf.length < 4) return
          len = buf.readUInt16BE(2)
          off = 4
        } else if (len === 127) {
          if (buf.length < 10) return
          len = Number(buf.readBigUInt64BE(2))
          off = 10
        }
        const maskOff = off
        if (masked) off += 4
        if (buf.length < off + len) return
        const payload = Buffer.from(buf.subarray(off, off + len))
        if (masked) for (let j = 0; j < payload.length; j++) payload[j]! ^= buf[maskOff + (j % 4)]!
        buf = buf.subarray(off + len)
        if (opcode === 0x8) {
          pg.end()
          ws.end(frame(0x8, Buffer.alloc(0)))
          return
        }
        if (opcode === 0x9) {
          ws.write(frame(0xa, payload))
          continue
        }
        if (opcode === 0x0 || opcode === 0x1 || opcode === 0x2) pg.write(payload)
      }
    }
    ws.on('data', (chunk: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      drain()
    })
    drain()
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  return {
    port,
    connections: () => accepted,
    close: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy()
        server.close(() => resolve())
      }),
  }
}
