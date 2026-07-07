import { describe, it, expect } from 'vitest';
import {
  signWebchatDelivery,
  verifyWebchatDelivery,
  webchatDeliveryBaseString,
} from '../webchat/delivery-hmac.js';

// ---------------------------------------------------------------------------
// FROZEN CONTRACT VECTOR
// Source: message-api/src/test/fixtures/webchat-delivery.fixture.json
// The delivery body object is written in the EXACT fixture key order so that
// JSON.stringify(body) reproduces the frozen `rawBody` byte-for-byte (the HMAC
// is computed over raw bytes — key order is load-bearing).
// ---------------------------------------------------------------------------
const WEBHOOK_SECRET = 'webchat-egress-secret-0123456789abcdef';
const TIMESTAMP = '1700000000000'; // 2023-11-14T22:13:20.000Z
const FROZEN_SIG_HEX = 'a98d675f84e8390301d9d15ad9de3622e5261c8582d668f68b6e1bc7a1ebc60a';
const FROZEN_SIG_HEADER = `sha256=${FROZEN_SIG_HEX}`;

const DELIVERY_BODY = {
  eventType: 'turn.delivery',
  channel: 'WEBCHAT',
  connectionUuid: '11111111-1111-4111-8111-111111111111',
  conversationUuid: '44444444-4444-4444-8444-444444444444',
  messageUuid: '66666666-6666-4666-8666-666666666666',
  idempotencyKey:
    '66666666-6666-4666-8666-666666666666:55555555-5555-4555-8555-555555555555',
  turn: {
    direction: 'OUTBOUND',
    authorType: 'AI',
    messageType: 'TEXT',
    content: 'Your top campaign is "Ramadan Promo" with 1,204 orders.',
    contentRich: null,
    systemEventType: null,
    recipientUserUuid: '22222222-2222-4222-8222-222222222222',
    executionId: '55555555-5555-4555-8555-555555555555',
    metadata: {
      source: 'whatsapp-switchboard',
      executionId: '55555555-5555-4555-8555-555555555555',
      execution_id: '55555555-5555-4555-8555-555555555555',
    },
  },
  timestamp: '2023-11-14T22:13:20.000Z',
};

const RAW_BODY = JSON.stringify(DELIVERY_BODY);
// `now` within the freshness window of the frozen timestamp
const FRESH_NOW = Number(TIMESTAMP);

describe('webchat delivery HMAC — frozen contract', () => {
  it('base string is `${timestamp}\\n${rawBody}`', () => {
    expect(webchatDeliveryBaseString(TIMESTAMP, RAW_BODY)).toBe(`${TIMESTAMP}\n${RAW_BODY}`);
  });

  it('signWebchatDelivery reproduces the frozen sha256=<hex> signature', () => {
    expect(signWebchatDelivery(RAW_BODY, TIMESTAMP, WEBHOOK_SECRET)).toBe(FROZEN_SIG_HEADER);
  });

  it('verifies the frozen fixture signature (valid)', () => {
    const r = verifyWebchatDelivery({
      rawBody: RAW_BODY,
      timestamp: TIMESTAMP,
      signatureHeader: FROZEN_SIG_HEADER,
      secret: WEBHOOK_SECRET,
      now: FRESH_NOW,
    });
    expect(r).toEqual({ ok: true, reason: 'ok' });
  });

  it('rejects a TAMPERED body (same signature, mutated bytes)', () => {
    const tampered = RAW_BODY.replace('1,204 orders', '9,999 orders');
    expect(tampered).not.toBe(RAW_BODY);
    const r = verifyWebchatDelivery({
      rawBody: tampered,
      timestamp: TIMESTAMP,
      signatureHeader: FROZEN_SIG_HEADER,
      secret: WEBHOOK_SECRET,
      now: FRESH_NOW,
    });
    expect(r).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a wrong secret', () => {
    const r = verifyWebchatDelivery({
      rawBody: RAW_BODY,
      timestamp: TIMESTAMP,
      signatureHeader: FROZEN_SIG_HEADER,
      secret: 'not-the-secret',
      now: FRESH_NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('bad_signature');
  });

  it('rejects a STALE timestamp (> ±5 min)', () => {
    const r = verifyWebchatDelivery({
      rawBody: RAW_BODY,
      timestamp: TIMESTAMP,
      signatureHeader: FROZEN_SIG_HEADER,
      secret: WEBHOOK_SECRET,
      now: FRESH_NOW + 6 * 60 * 1000, // 6 minutes later
    });
    expect(r).toEqual({ ok: false, reason: 'stale' });
  });

  it('accepts a timestamp within the ±5 min window', () => {
    const r = verifyWebchatDelivery({
      rawBody: RAW_BODY,
      timestamp: TIMESTAMP,
      signatureHeader: FROZEN_SIG_HEADER,
      secret: WEBHOOK_SECRET,
      now: FRESH_NOW + 4 * 60 * 1000, // 4 minutes later — still fresh
    });
    expect(r.ok).toBe(true);
  });

  it('rejects missing signature / timestamp headers', () => {
    expect(
      verifyWebchatDelivery({ rawBody: RAW_BODY, timestamp: TIMESTAMP, signatureHeader: null, secret: WEBHOOK_SECRET, now: FRESH_NOW }),
    ).toEqual({ ok: false, reason: 'missing_signature' });
    expect(
      verifyWebchatDelivery({ rawBody: RAW_BODY, timestamp: null, signatureHeader: FROZEN_SIG_HEADER, secret: WEBHOOK_SECRET, now: FRESH_NOW }),
    ).toEqual({ ok: false, reason: 'missing_timestamp' });
  });

  it('sign → verify round-trips for an arbitrary body', () => {
    const body = JSON.stringify({ hello: 'world', n: 42 });
    const ts = String(Date.now());
    const sig = signWebchatDelivery(body, ts, WEBHOOK_SECRET);
    expect(sig.startsWith('sha256=')).toBe(true);
    const r = verifyWebchatDelivery({ rawBody: body, timestamp: ts, signatureHeader: sig, secret: WEBHOOK_SECRET });
    expect(r.ok).toBe(true);
  });
});
