/**
 * WEBCHAT deliveryUrl HMAC — the signed turn-plane egress contract (R2-9).
 *
 * message-api's WEBCHAT adapter signs each durable turn it POSTs to the
 * connection `deliveryUrl`; the host receiver (yobo / cadra-web) verifies here.
 *
 * Scheme (FROZEN — message-api/src/test/fixtures/webchat-delivery.fixture.json):
 *   - base string = `${X-Callback-Timestamp}\n${rawBody}`
 *   - signature   = HMAC-SHA256(webhook_secret, baseString) as lowercase hex
 *   - header      = `X-Callback-Signature: sha256=<hex>`  + `X-Callback-Timestamp`
 *   - freshness    = ±5 min on the timestamp
 *   - verify       = CONSTANT-TIME
 *
 * `rawBody` MUST be the exact request bytes as received — never a
 * re-serialization (JSON key order is load-bearing for the HMAC).
 *
 * Server-only (node:crypto). Import from a Node/Edge-with-crypto server route,
 * never a browser bundle.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Default freshness window: ±5 minutes (matches the responder-completion HMAC). */
export const WEBCHAT_DELIVERY_FRESHNESS_MS = 5 * 60 * 1000;

const SIG_PREFIX = 'sha256=';

/** Build the exact HMAC base string: `${timestamp}\n${rawBody}`. */
export function webchatDeliveryBaseString(timestamp: string, rawBody: string): string {
  return `${timestamp}\n${rawBody}`;
}

/**
 * Compute the `X-Callback-Signature` header value for a delivery POST.
 * @returns `sha256=<lowercase-hex>`
 */
export function signWebchatDelivery(rawBody: string, timestamp: string, secret: string): string {
  const hex = createHmac('sha256', secret)
    .update(webchatDeliveryBaseString(timestamp, rawBody))
    .digest('hex');
  return `${SIG_PREFIX}${hex}`;
}

export interface VerifyWebchatDeliveryInput {
  /** The exact raw request body bytes (string). */
  rawBody: string;
  /** The `X-Callback-Timestamp` header (epoch millis as a string). */
  timestamp: string | null | undefined;
  /** The `X-Callback-Signature` header, e.g. `sha256=<hex>`. */
  signatureHeader: string | null | undefined;
  /** The connection `webhook_secret`. */
  secret: string;
  /** Freshness window in ms (default ±5 min). */
  toleranceMs?: number;
  /** Injectable clock for tests (epoch ms). */
  now?: number;
}

export type WebchatDeliveryVerifyReason =
  | 'ok'
  | 'missing_signature'
  | 'missing_timestamp'
  | 'bad_timestamp'
  | 'stale'
  | 'bad_signature';

export interface WebchatDeliveryVerifyResult {
  ok: boolean;
  reason: WebchatDeliveryVerifyReason;
}

/**
 * Constant-time verify of a WEBCHAT delivery POST. Checks (in order):
 *   1. signature + timestamp headers present
 *   2. timestamp within ±toleranceMs of now (replay defence)
 *   3. HMAC over `${timestamp}\n${rawBody}` matches, constant-time
 *
 * Never throws — always returns a tagged result so the caller can 401 cleanly.
 */
export function verifyWebchatDelivery(input: VerifyWebchatDeliveryInput): WebchatDeliveryVerifyResult {
  const { rawBody, timestamp, signatureHeader, secret } = input;
  const toleranceMs = input.toleranceMs ?? WEBCHAT_DELIVERY_FRESHNESS_MS;
  const now = input.now ?? Date.now();

  if (!signatureHeader) return { ok: false, reason: 'missing_signature' };
  if (!timestamp) return { ok: false, reason: 'missing_timestamp' };

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(now - ts) > toleranceMs) return { ok: false, reason: 'stale' };

  const expected = signWebchatDelivery(rawBody, timestamp, secret);

  // Constant-time compare of equal-length buffers. Length mismatch is an
  // immediate reject (timingSafeEqual throws on unequal lengths).
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: 'bad_signature' };
  const match = timingSafeEqual(a, b);
  return match ? { ok: true, reason: 'ok' } : { ok: false, reason: 'bad_signature' };
}
