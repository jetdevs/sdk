// Client
export { MessagingClient } from './client.js';

// HTTP
export { MessagingApiError } from './http.js';

// SSE
export { SSEClient } from './realtime/sse-client.js';
export type { SSEClientConfig } from './realtime/sse-client.js';

// Types - re-export everything
export type {
  // Enums
  ChannelType,
  ConversationStatus,
  ConversationPriority,
  MessageDirection,
  MessageType,
  DeliveryStatus,
  AuthorType,
  ConnectionStatus,
  TemplateStatus,
  WebhookEventStatus,
  AgentPresence,
  SSEEventType,
  // API envelope
  ApiResponse,
  PaginatedResponse,
  CursorPaginatedResponse,
  PagePagination,
  CursorPagination,
  ApiError,
  PageParams,
  CursorParams,
  // Connections
  Connection,
  ConnectionHealth,
  CreateConnectionData,
  UpdateConnectionData,
  TestConnectionData,
  TestConnectionResult,
  ListConnectionsParams,
  // Device Link
  StartDeviceLinkData,
  DeviceLinkResult,
  DeviceLinkStatus,
  DeviceLinkStatusResult,
  RefreshQrResult,
  // Callback Management
  RegisterCallbackData,
  // Conversations
  Conversation,
  ConversationContact,
  ConversationConnection,
  ConversationSession,
  CreateConversationData,
  UpdateConversationData,
  ListConversationsParams,
  AssignConversationData,
  UnreadCountResponse,
  // Messages
  Message,
  MessageAttachment,
  SendMessageData,
  SendMessageAcceptResult,
  SendTemplateData,
  AddNoteData,
  ListMessagesParams,
  // Contacts
  Contact,
  ContactIdentity,
  CreateContactData,
  UpdateContactData,
  MergeContactsData,
  ListContactsParams,
  // Templates
  Template,
  CreateTemplateData,
  UpdateTemplateData,
  ListTemplatesParams,
  // Media
  Media,
  // Agents
  AgentStatus,
  AgentStats,
  // Webhook Events
  WebhookEvent,
  ListWebhookEventsParams,
  // Audit Log
  AuditLogEntry,
  QueryAuditLogParams,
  // Metrics
  OrgMetrics,
  PlatformMetrics,
  // Realtime
  RealtimeToken,
  CreateRealtimeTokenData,
  SSEEvent,
  // Queues (Platform)
  QueueInfo,
  QueueJob,
  ListQueueJobsParams,
  // Rate Limits (Platform)
  RateLimitEntry,
  SetRateLimitData,
  // Platform Connections
  PlatformConnection,
  ListPlatformConnectionsParams,
  ListPlatformTemplatesParams,
  // Client config
  MessagingClientConfig,
} from './types/index.js';
