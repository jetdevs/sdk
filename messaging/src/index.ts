// Client
export { MessagingClient } from './client.js';

// HTTP
export { MessagingApiError } from './http.js';

// SSE
export { SSEClient } from './realtime/sse-client.js';
export type { SSEClientConfig } from './realtime/sse-client.js';

// WEBCHAT channel (in-app copilot) — ingress client, delivery HMAC, wire types
export { ChannelsResource } from './webchat/channels-resource.js';
export {
  WEBCHAT_SYSTEM_EVENT_TYPES,
  isWebchatDeliveryPayload,
  isWebchatAiRouted,
  isWebchatStartFailure,
  isWebchatDuplicate,
} from './webchat/types.js';
export type {
  WebchatNormalizedMessage,
  WebchatIngressRequest,
  WebchatIngressResponse,
  WebchatIngressAiResponse,
  WebchatIngressHumanResponse,
  WebchatIngressStartFailureResponse,
  WebchatIngressDuplicateResponse,
  WebchatSystemEventType,
  WebchatDeliveryTurn,
  WebchatDeliveryPayload,
} from './webchat/types.js';
export {
  WEBCHAT_DELIVERY_FRESHNESS_MS,
  webchatDeliveryBaseString,
  signWebchatDelivery,
  verifyWebchatDelivery,
} from './webchat/delivery-hmac.js';
export type {
  VerifyWebchatDeliveryInput,
  WebchatDeliveryVerifyResult,
  WebchatDeliveryVerifyReason,
} from './webchat/delivery-hmac.js';

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
