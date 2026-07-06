// ============================================================
// Messaging SDK Types
// ============================================================

// --- Enums ---

export type ChannelType = 'WHATSAPP' | 'WHATSAPP_DEVICE' | 'TELEGRAM' | 'LINE' | 'KAKAO' | 'EMAIL' | 'INTERNAL' | 'SLACK' | 'DISCORD';

export type ConversationStatus = 'OPEN' | 'PENDING' | 'SNOOZED' | 'RESOLVED' | 'CLOSED';

export type ConversationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'LOCATION' | 'CONTACT' | 'STICKER' | 'TEMPLATE' | 'INTERACTIVE' | 'REACTION' | 'NOTE';

export type DeliveryStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

// 'AI' is a first-class author: msg-api persists AND streams AI responder replies
// with authorType:'AI' (message-api/src/services/responder-completion.ts:243,353).
// Do NOT normalize AI->BOT — the distinction feeds Phase A's AI/Human badge.
export type AuthorType = 'USER' | 'CONTACT' | 'SYSTEM' | 'BOT' | 'AI';

// System-turn vocabulary (Phase A, D22). msg-api stamps SYSTEM rows with one of
// these on the AI<->human handoff path; the CRM renders them as centered chips
// (unknown values fall back to the raw-content chip). Persisted as a nullable
// column — a normal message row carries systemEventType: null.
export type SystemEventType =
  | 'handoff.requested'
  | 'handoff.joined'
  | 'handoff.released'
  | 'welcome'
  | 'holding'
  | 'apology';

export type ConnectionStatus = 'ACTIVE' | 'ERROR' | 'DISCONNECTED' | 'PENDING' | 'SYNCING';

export type TemplateStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type WebhookEventStatus = 'PENDING' | 'PROCESSED' | 'FAILED' | 'SKIPPED';

export type AgentPresence = 'ONLINE' | 'AWAY' | 'OFFLINE';

// --- API Envelope ---

export interface ApiResponse<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { requestId: string; timestamp: string };
  pagination: PagePagination;
}

export interface CursorPaginatedResponse<T> {
  data: T[];
  meta: { requestId: string; timestamp: string };
  pagination: CursorPagination;
}

export interface PagePagination {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CursorPagination {
  cursor: string | null;
  hasMore: boolean;
  limit: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: { requestId: string };
}

// --- Pagination Params ---

export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface CursorParams {
  cursor?: string;
  limit?: number;
  direction?: 'before' | 'after';
}

// --- Channel Connections ---

export interface Connection {
  uuid: string;
  channel: ChannelType;
  name: string;
  status: ConnectionStatus;
  webhookUrl: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionHealth {
  uuid: string;
  status: ConnectionStatus;
  lastHealthCheck: string | null;
  lastSync: string | null;
  errorCount24h: number;
  messageCount24h: number;
  uptime: number | null;
  lastError: string | null;
}

export interface CreateConnectionData {
  channel: ChannelType;
  name: string;
  config: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdateConnectionData {
  name?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface TestConnectionData {
  channel: ChannelType;
  config: Record<string, unknown>;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
}

export interface ListConnectionsParams extends PageParams {
  channel?: ChannelType;
  status?: ConnectionStatus;
}

// --- Device Link ---

export interface StartDeviceLinkData {
  name: string;
}

export interface DeviceLinkResult {
  connectionUuid: string;
  linkId: string;
  qrDataUrl: string;
  expiresAt: string;
}

export type DeviceLinkStatus = 'waiting_scan' | 'connected' | 'expired' | 'error';

export interface DeviceLinkStatusResult {
  status: DeviceLinkStatus;
  qrDataUrl?: string;
  phoneNumber?: string;
  jid?: string;
  error?: string;
}

export interface RefreshQrResult {
  qrDataUrl: string;
  expiresAt: string;
}

// --- Callback Management ---

export interface RegisterCallbackData {
  callbackUrl: string;
  callbackSecret: string;
}

// --- Conversations ---

export interface ConversationContact {
  uuid: string;
  displayName: string;
  identifier: string;
}

export interface ConversationConnection {
  uuid: string;
  name: string;
}

export interface ConversationSession {
  canSendFreeForm: boolean;
  windowExpiresAt: string | null;
}

export interface Conversation {
  uuid: string;
  channel: ChannelType;
  status: ConversationStatus;
  priority: ConversationPriority;
  contact: ConversationContact;
  connection: ConversationConnection;
  assignedToUserId: string | null;
  subject: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: MessageDirection | null;
  unreadCount: number;
  messageCount: number;
  tags: string[];
  session: ConversationSession | null;
  createdAt: string;
}

export interface CreateConversationData {
  channel: ChannelType;
  connectionUuid: string;
  contactUuid?: string;
  subject?: string;
  status?: ConversationStatus;
  priority?: ConversationPriority;
}

export interface UpdateConversationData {
  status?: ConversationStatus;
  priority?: ConversationPriority;
  tags?: string[];
  subject?: string;
}

export interface ListConversationsParams extends PageParams {
  channel?: ChannelType;
  status?: ConversationStatus;
  assignedTo?: string;
  unassigned?: boolean;
  search?: string;
  sortBy?: 'lastMessageAt' | 'createdAt' | 'unreadCount';
  sortOrder?: 'asc' | 'desc';
}

export interface AssignConversationData {
  userId: string | null;
}

export interface UnreadCountResponse {
  count: number;
}

// --- Messages ---

export interface Message {
  uuid: string;
  conversationUuid: string;
  channel: ChannelType;
  direction: MessageDirection;
  messageType: MessageType;
  content: string | null;
  deliveryStatus: DeliveryStatus;
  authorType: AuthorType;
  authorId: string | null;
  // Set only on SYSTEM handoff turns (Phase A); null on every ordinary row.
  systemEventType?: SystemEventType | null;
  replyToUuid: string | null;
  attachments: MessageAttachment[];
  metadata: Record<string, unknown>;
  isInternal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageAttachment {
  uuid: string;
  mediaUuid: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  downloadUrl: string;
  thumbnailUrl: string | null;
}

export interface SendMessageData {
  conversationUuid: string;
  messageType?: MessageType;
  content: string;
  replyToUuid?: string;
  attachments?: string[]; // media UUIDs
  metadata?: Record<string, unknown>;
}

export interface SendTemplateData {
  conversationUuid: string;
  templateUuid: string;
  variables: Record<string, string>;
}

export interface AddNoteData {
  content: string;
}

export interface ListMessagesParams extends CursorParams {}

// --- Contacts ---

export interface ContactIdentity {
  id: number;
  channel: ChannelType;
  identifier: string;
  identifierType: 'PHONE' | 'EMAIL' | 'USERNAME' | 'PLATFORM_ID';
}

export interface Contact {
  uuid: string;
  displayName: string;
  avatarUrl: string | null;
  externalRefId: string | null;
  identities: ContactIdentity[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContactData {
  displayName: string;
  externalRefId?: string;
  identities?: Array<{
    channel: ChannelType;
    identifier: string;
    identifierType: 'PHONE' | 'EMAIL' | 'USERNAME' | 'PLATFORM_ID';
  }>;
  metadata?: Record<string, unknown>;
}

export interface UpdateContactData {
  displayName?: string;
  externalRefId?: string;
  metadata?: Record<string, unknown>;
}

export interface MergeContactsData {
  sourceUuid: string;
  targetUuid: string;
}

export interface ListContactsParams extends PageParams {
  search?: string;
  channel?: ChannelType;
}

// --- Templates ---

export interface Template {
  uuid: string;
  channel: ChannelType;
  name: string;
  category: string;
  content: string;
  variables: string[];
  language: string;
  status: TemplateStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateData {
  channel: ChannelType;
  name: string;
  category: string;
  content: string;
  variables?: string[];
  language?: string;
}

export interface UpdateTemplateData {
  name?: string;
  category?: string;
  content?: string;
  variables?: string[];
  language?: string;
}

export interface ListTemplatesParams extends PageParams {
  channel?: ChannelType;
  status?: TemplateStatus;
  search?: string;
}

// --- Media ---

export interface Media {
  uuid: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  downloadUrl: string;
  thumbnailUrl: string | null;
  expiresAt: string;
}

// --- Agent Presence ---

export interface AgentStatus {
  userId: string;
  presence: AgentPresence;
  activeConversations: number;
  maxCapacity: number;
  lastActiveAt: string;
}

export interface AgentStats {
  userId: string;
  activeConversations: number;
  resolvedToday: number;
  avgResponseTime: number;
}

// --- Webhook Events ---

export interface WebhookEvent {
  uuid: string;
  orgId: string;
  channel: ChannelType;
  connectionUuid: string;
  eventType: string;
  externalId: string | null;
  status: WebhookEventStatus;
  payload: Record<string, unknown>;
  error: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface ListWebhookEventsParams extends PageParams {
  status?: WebhookEventStatus;
  channel?: ChannelType;
  eventType?: string;
  orgId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Audit Log ---

export interface AuditLogEntry {
  uuid: string;
  action: string;
  actorId: string;
  actorType: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface QueryAuditLogParams extends PageParams {
  action?: string;
  actorId?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  orgId?: string;
}

// --- Metrics ---

export interface OrgMetrics {
  period: string;
  messagesSent: number;
  messagesReceived: number;
  conversationsCreated: number;
  conversationsResolved: number;
  avgResponseTime: number;
  deliveryRate: number;
  channels: Record<ChannelType, { sent: number; received: number }>;
}

export interface PlatformMetrics extends OrgMetrics {
  activeOrgs: number;
  activeConnections: number;
  totalAgentsOnline: number;
  queueDepth: Record<string, number>;
  systemHealth: {
    database: 'healthy' | 'degraded' | 'down';
    redis: 'healthy' | 'degraded' | 'down';
    workers: 'healthy' | 'degraded' | 'down';
  };
}

// --- Realtime ---

export interface RealtimeToken {
  token: string;
  expiresAt: string;
}

export interface CreateRealtimeTokenData {
  userId: string;
  scopes?: string[];
}

// --- Queues (Platform) ---

export interface QueueInfo {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface QueueJob {
  id: string;
  name: string;
  status: string;
  data: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  failedReason: string | null;
  createdAt: string;
  processedAt: string | null;
  finishedAt: string | null;
}

export interface ListQueueJobsParams extends PageParams {
  status?: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
}

// --- Rate Limits (Platform) ---

export interface RateLimitEntry {
  orgId: string;
  apiRateLimit: number;
  channelLimits: Record<ChannelType, number>;
  currentUsage: number;
}

export interface SetRateLimitData {
  apiRateLimit?: number;
  channelLimits?: Partial<Record<ChannelType, number>>;
}

// --- Platform Channel Listing ---

export interface PlatformConnection extends Connection {
  orgId: string;
  orgName: string;
  health: ConnectionHealth | null;
}

export interface ListPlatformConnectionsParams extends PageParams {
  channel?: ChannelType;
  status?: ConnectionStatus;
  orgId?: string;
  search?: string;
}

export interface ListPlatformTemplatesParams extends PageParams {
  channel?: ChannelType;
  status?: TemplateStatus;
  orgId?: string;
  search?: string;
}

// --- Platform Cross-Org Conversations (Phase B) ---

export interface ConversationOrgRef {
  uuid: string;
  name: string;
}

/** Redacted binding summary (p4 §9.2) — never the raw responder ref. */
export interface ConversationBindingSummary {
  kind: 'agent' | 'team' | 'human';
  name: string | null;
  agentUuid?: string | null;
  teamUuid?: string | null;
}

/**
 * Cross-org conversation row: the Tier-1 Conversation shape plus attribution.
 * `channel` is a PLAIN STRING (channel-agnostic invariant): a new msg-api
 * channel appears here with zero SDK changes.
 */
export interface PlatformConversation extends Omit<Conversation, 'channel' | 'contact' | 'connection'> {
  channel: string;
  org: ConversationOrgRef;
  contact: { uuid: string; name: string | null; identifier: string | null } | null;
  connection: { uuid: string; name: string; channel: string } | null;
  binding: ConversationBindingSummary | null;
  // Switchboard passthrough — inert in B, rendered by Phase A.
  responderMode: 'ai' | 'human';
  handoffState: 'none' | 'pending_human' | 'human_active';
  takenOverByUserId: string | null;
}

/** Cross-org list response = the cursor page PLUS the complete org facet (CS filter source). */
export interface PlatformConversationsPage extends CursorPaginatedResponse<PlatformConversation> {
  facets: { orgs: Array<{ uuid: string; name: string; conversationCount: number }> };
}

export interface ListPlatformConversationsParams {
  /** Opaque keyset cursor from the previous page's pagination.cursor. */
  cursor?: string;
  limit?: number;
  /** Org UUID filter. */
  orgId?: string;
  /** Plain string equality — no enum (channel-agnostic invariant). */
  channel?: string;
  status?: ConversationStatus;
  assignedTo?: string;
  unassigned?: boolean;
  responderMode?: 'ai' | 'human';
  handoffState?: 'none' | 'pending_human' | 'human_active';
  search?: string;
}

// --- SSE Events ---

export type SSEEventType =
  | 'message:new'
  | 'message:status'
  | 'message:deleted'
  | 'conversation:assigned'
  | 'conversation:status'
  | 'conversation:created'
  | 'unread:count'
  | 'typing:start'
  | 'typing:stop'
  | 'connection:status';

export interface SSEEvent {
  id: string;
  type: SSEEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

// --- Client Config ---

export interface MessagingClientConfig {
  baseUrl: string;
  apiKey?: string;
  orgId?: string;
  platformKey?: string;
  /** Service-to-service secret for trusted passthrough auth (no API key needed) */
  serviceSecret?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retry attempts for 429/503 (default: 3) */
  maxRetries?: number;
}
