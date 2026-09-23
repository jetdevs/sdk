/**
 * p77 STORY-004 — `ConnectOwnerClient`: the two questions an RP's
 * credential-owner resolver asks Connect server-to-server (specs.md §4.2,
 * §5.2 `./server/owner`).
 *
 *   1. `emailHeld(email)` — does Connect already hold an account for this
 *      email? Asked before the RP ALLOCATES a local identity (register,
 *      invite, create), so I5 — one email, one person, both ways — holds.
 *        POST {issuer}/api/internal/connect/email-held  { email }
 *          → 200 { held: boolean }
 *      Anything else is `unreachable`; the RESOLVER decides what that means
 *      (fail-closed while the flag is on).
 *
 *   2. `forwardResetRequest(email)` — a password-reset REQUEST for a user
 *      whose credential Connect owns. Forwarded, never proxied: no verifier
 *      crosses the wire, Connect mints its own link and sends the ONE email.
 *      The caller answers the same silent success as a local request.
 *        POST {issuer}/api/internal/connect/reset-forward  { email }
 *          → 200 { ok: true } ; 503 { error: 'maintenance' } while the switch is on (D26)
 *      A non-200 throws — the only trace that the owner did not take it.
 *
 * p79's public-route fallback (a client built without an internal key) is
 * not ported: every p77 RP holds its key, and the public route's per-IP
 * bucket is the trap STORY-044 closed.
 *
 * Nothing here logs an email or a body.
 *
 * Ported-From: cadra-web@b615864c:src/server/auth/connect-owner-client.ts
 */

import type { RpSystem } from '../../adapter/index.js'

export const CONNECT_EMAIL_HELD_PATH = '/api/internal/connect/email-held'
export const CONNECT_RESET_FORWARD_PATH = '/api/internal/connect/reset-forward'

export type EmailHeldAnswer = 'held' | 'free' | 'unreachable'

export interface ConnectOwnerClient {
  /** The issuer this client talks to, without a trailing slash. */
  readonly issuer: string
  emailHeld(email: string): Promise<EmailHeldAnswer>
  forwardResetRequest(email: string): Promise<void>
}

export interface ConnectOwnerClientOptions {
  issuer: string
  /** This RP's key in Connect's `INTERNAL_KEYS_JSON`. */
  rpKey: string
  system: RpSystem
  /** Resolved per call when omitted, so a test can swap `globalThis.fetch`. */
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 5_000

export function createConnectOwnerClient(options: ConnectOwnerClientOptions): ConnectOwnerClient {
  const issuer = (options.issuer ?? '').trim().replace(/\/+$/, '')
  if (!issuer) throw new Error('createConnectOwnerClient: issuer is required')
  if (!options.rpKey) throw new Error('createConnectOwnerClient: rpKey is required')
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function post(path: string, body: unknown): Promise<{ status: number; json: unknown } | null> {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch
    try {
      const res = await fetchImpl(issuer + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Internal-API-Key': options.rpKey,
          'X-Service-Name': options.system,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
      let json: unknown = null
      try {
        json = await res.json()
      } catch {
        json = null
      }
      return { status: res.status, json }
    } catch {
      return null
    }
  }

  return {
    issuer,
    async emailHeld(email) {
      const reply = await post(CONNECT_EMAIL_HELD_PATH, { email: email.trim() })
      if (!reply || reply.status !== 200) return 'unreachable'
      const held = (reply.json as { held?: unknown } | null)?.held
      if (typeof held !== 'boolean') return 'unreachable'
      return held ? 'held' : 'free'
    },
    async forwardResetRequest(email) {
      const reply = await post(CONNECT_RESET_FORWARD_PATH, { email: email.trim() })
      if (!reply || reply.status !== 200) {
        throw new Error(`Connect did not accept the forwarded reset request (status ${reply?.status ?? 'unreachable'})`)
      }
    },
  }
}
