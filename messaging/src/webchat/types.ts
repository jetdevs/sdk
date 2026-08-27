/**
 * WEBCHAT channel — the in-app agentic-chat copilot as a takeover-able channel.
 *
 * These are the SHARED wire types for the two seams the copilot host (yobo /
 * cadra-web) talks to message-api over:
 *
 *   1. Turn-plane OUT — the internal channel ingress
 *      (`POST /api/v1/internal/channels/ingress`, Tier-3 X-Service-Secret).
 *   2. Turn-plane IN  — the signed `deliveryUrl` receiver payload
 *      (`X-Callback-Signature` / `X-Callback-Timestamp`, HMAC per delivery-hmac.ts).
 *
 * The live execution stream (token narration, thinking pills, tool cards,
 * artifact deltas) is TELEMETRY and NEVER crosses these seams — it stays on the
 * host's existing SSE. Only durable turns (user / AI-final / operator / system)
 * flow here.
 *
 * Contract source: message-api frozen fixtures
 *   src/test/fixtures/webchat-ingress.fixture.json
 *   src/test/fixtures/webchat-delivery.fixture.json
 * Design: _context/messaging/_specs/p4-unified-messaging/channels/webchat.md §1-§5
 *         parent specs.md §2.4 R2-3 / R2-9.
 */

// ---------------------------------------------------------------------------
// Turn-plane OUT — ingress request + sync-response contract (webchat.md §3)
// ---------------------------------------------------------------------------

/**
 * Channel-agnostic normalized inbound message (the WEBCHAT slice of it).
 *
 * `externalId` = the app-minted client-turn uuid (M5). Ingress idempotency is
 * enforced by the per-channel inbound unique index on (org_id, external_id).
 */
export interface WebchatNormalizedMessage {
  /** The logged-in app user's uuid — the contact key (parent D13, uuids only). */
  userUuid: string;
  /** Channel-native sender key. Defaults to userUuid when omitted. */
  senderIdentifier?: string;
  /** The user's turn text. */
  text: string;
  /** App-minted client-turn uuid (M5) — the inbound externalId / dedupe key. */
  externalId: string;
  /** Optional display name supplied at ingress. */
  senderName?: string;
  /** Channel-native routing context, such as Slack channel/thread ids. */
  contentRich?: Record<string, unknown> | null;
  /** Provider-native message/thread id this turn replies to. */
  replyToExternalId?: string;
}

/**
 * Body of `POST /api/v1/internal/channels/ingress`.
 *
 * `executionContext` is the signed, base64 `X-Execution-Context` envelope
 * (`s.tid` = the merchant tenant org). msg-api keeps it OPAQUE (D3) — it is a
 * string here on purpose; only cadra-api ever parses it.
 */
export interface WebchatIngressRequest {
  connectionUuid: string;
  message: WebchatNormalizedMessage;
  /** Opaque signed X-Execution-Context envelope (base64). Never parsed by msg-api. */
  executionContext?: string;
  /**
   * Merchant-org attribution (org-attribution §10), sent PLAIN beside the
   * signed envelope — msg-api persists it first-class (the envelope stays
   * opaque, D3). Optional: old callers omit both; old msg-api ignores them.
   */
  targetOrgId?: number;
  /**
   * Merchant org display name (`session.user.currentOrg.name`). Senders must
   * suppress the `Organization ${id}` placeholder — id-only turns attribute
   * on a later named turn (§13).
   */
  targetOrgName?: string;
  /** App-resolved Cadra team for webchat. */
  teamUuid?: string;
  /** Per-turn responder selected by the calling app; never persisted as a binding. */
  responderRef?: {
    kind: string;
    ref: Record<string, unknown>;
  };
}

/** AI-routed: the pane attaches its EXISTING SDK telemetry stream by executionId (NO streamUrl — F3). */
export interface WebchatIngressAiResponse {
  conversationUuid: string;
  executionId: string;
}

/** Human-routed (mode=human / pending_human): no execution started. */
export interface WebchatIngressHumanResponse {
  conversationUuid: string;
}

/** Responder start-failure (M2): token cleared (H3) + fallback_message turn written. */
export interface WebchatIngressStartFailureResponse {
  conversationUuid: string;
  error: 'responder_start_failed';
}

/** Duplicate externalId (idempotent re-POST): no re-route. */
export interface WebchatIngressDuplicateResponse {
  conversationUuid: string;
  duplicate: true;
}

export type WebchatIngressResponse =
  | WebchatIngressAiResponse
  | WebchatIngressHumanResponse
  | WebchatIngressStartFailureResponse
  | WebchatIngressDuplicateResponse;

/** Narrow the sync response to the AI-routed shape (has an executionId, no error/duplicate). */
export function isWebchatAiRouted(r: WebchatIngressResponse): r is WebchatIngressAiResponse {
  return (
    typeof (r as WebchatIngressAiResponse).executionId === 'string' &&
    !(r as WebchatIngressStartFailureResponse).error &&
    !(r as WebchatIngressDuplicateResponse).duplicate
  );
}

/** Narrow to the start-failure shape. */
export function isWebchatStartFailure(r: WebchatIngressResponse): r is WebchatIngressStartFailureResponse {
  return (r as WebchatIngressStartFailureResponse).error === 'responder_start_failed';
}

/** Narrow to the duplicate shape. */
export function isWebchatDuplicate(r: WebchatIngressResponse): r is WebchatIngressDuplicateResponse {
  return (r as WebchatIngressDuplicateResponse).duplicate === true;
}

// ---------------------------------------------------------------------------
// Turn-plane IN — the signed deliveryUrl payload (webchat.md §4, R2-9)
// ---------------------------------------------------------------------------

/**
 * D22 system-turn vocabulary (R2-5). Rendered by the pane as a system chip +
 * pane-mode flip. `null` on ordinary (non-system) turns.
 */
export type WebchatSystemEventType =
  | 'handoff.requested'
  | 'handoff.joined'
  | 'handoff.released'
  | 'welcome'
  | 'holding'
  | 'apology';

export const WEBCHAT_SYSTEM_EVENT_TYPES: readonly WebchatSystemEventType[] = [
  'handoff.requested',
  'handoff.joined',
  'handoff.released',
  'welcome',
  'holding',
  'apology',
] as const;

/**
 * A durable turn as delivered on the turn plane. This is the CANONICAL record —
 * for AI OUTBOUND turns the pane REPLACES the streamed telemetry final on
 * `executionId` match (F5).
 */
export interface WebchatDeliveryTurn {
  direction: MessageDirectionLite;
  /** AI | CONTACT | USER (operator) | SYSTEM — uppercase (msg-api convention). */
  authorType: string;
  /** CONTENT type (TEXT/IMAGE/…) — never overloaded with the system-event type (R2-5). */
  messageType: string;
  content: string;
  contentRich?: unknown | null;
  /** Non-null on system turns (D22). */
  systemEventType?: WebchatSystemEventType | null;
  /** The contact user uuid this turn is addressed to (the pane-binding key, M4). */
  recipientUserUuid: string;
  /** Present on AI OUTBOUND turns — the dedupe/replace key (F5). */
  executionId?: string | null;
  metadata?: Record<string, unknown> | null;
}

type MessageDirectionLite = 'INBOUND' | 'OUTBOUND';

/**
 * The full signed body msg-api POSTs to the connection `deliveryUrl`.
 * The HMAC base string is `${X-Callback-Timestamp}\n${rawBody}` — verify against
 * the RAW request bytes, never a re-serialization (key order is load-bearing).
 */
export interface WebchatDeliveryPayload {
  eventType: 'turn.delivery';
  channel: 'WEBCHAT';
  connectionUuid: string;
  conversationUuid: string;
  messageUuid: string;
  /** `${messageUuid}:${executionId}` for AI finals, else `${messageUuid}`. */
  idempotencyKey: string;
  turn: WebchatDeliveryTurn;
  /** ISO timestamp of the turn. */
  timestamp: string;
}

/**
 * Dual-plane guard (webchat.md §1). Returns true only for a well-formed durable
 * turn-delivery payload. Any telemetry-only shape (token narration, thinking
 * pills, tool-call cards, artifact deltas, progress/status events) fails this —
 * telemetry must NEVER arrive on the deliveryUrl receiver.
 */
export function isWebchatDeliveryPayload(value: unknown): value is WebchatDeliveryPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.eventType !== 'turn.delivery') return false;
  if (v.channel !== 'WEBCHAT') return false;
  if (typeof v.messageUuid !== 'string') return false;
  if (typeof v.conversationUuid !== 'string') return false;
  const turn = v.turn as Record<string, unknown> | undefined;
  if (!turn || typeof turn !== 'object') return false;
  if (turn.direction !== 'INBOUND' && turn.direction !== 'OUTBOUND') return false;
  if (typeof turn.authorType !== 'string') return false;
  if (typeof turn.messageType !== 'string') return false;
  if (typeof turn.recipientUserUuid !== 'string') return false;
  return true;
}
