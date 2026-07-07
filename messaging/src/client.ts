import { HttpClient } from './http.js';
import { ConversationsResource } from './resources/conversations.js';
import { MessagesResource } from './resources/messages.js';
import { ConnectionsResource } from './resources/connections.js';
import { ContactsResource } from './resources/contacts.js';
import { TemplatesResource } from './resources/templates.js';
import { MediaResource } from './resources/media.js';
import { AgentsResource } from './resources/agents.js';
import { WebhookEventsResource } from './resources/webhook-events.js';
import { AuditLogResource } from './resources/audit-log.js';
import { MetricsResource } from './resources/metrics.js';
import { RealtimeResource } from './resources/realtime.js';
import { PlatformResource } from './resources/platform.js';
import { ChannelsResource } from './webchat/channels-resource.js';
import type { MessagingClientConfig } from './types/index.js';

/**
 * Main entry point for the @jetdevs/messaging SDK.
 *
 * Usage (Tier 1 - org-scoped):
 * ```ts
 * const client = new MessagingClient({
 *   baseUrl: 'https://messaging.example.com',
 *   apiKey: process.env.MESSAGING_API_KEY,
 *   orgId: 'org_uuid',
 * });
 * const convos = await client.conversations.list();
 * ```
 *
 * Usage (Tier 2 - platform):
 * ```ts
 * const platformClient = new MessagingClient({
 *   baseUrl: 'https://messaging.example.com',
 *   platformKey: process.env.MESSAGING_ADMIN_KEY,
 * });
 * const metrics = await platformClient.platform.metrics.get({ period: '24h' });
 * ```
 */
export class MessagingClient {
  private readonly http: HttpClient;

  /** Conversation management */
  readonly conversations: ConversationsResource;
  /** Message sending and retrieval */
  readonly messages: MessagesResource;
  /** Channel connection management */
  readonly connections: ConnectionsResource;
  /** Contact management */
  readonly contacts: ContactsResource;
  /** Message template management */
  readonly templates: TemplatesResource;
  /** Media upload/download */
  readonly media: MediaResource;
  /** Agent presence and stats */
  readonly agents: AgentsResource;
  /** Webhook event inspection (org-scoped) */
  readonly webhookEvents: WebhookEventsResource;
  /** Audit log queries (org-scoped) */
  readonly auditLog: AuditLogResource;
  /** Messaging metrics (org-scoped) */
  readonly metrics: MetricsResource;
  /** Realtime token issuance */
  readonly realtime: RealtimeResource;
  /** Platform-level operations (Tier 2, requires platformKey) */
  readonly platform: PlatformResource;
  /** Internal channel ingress (Tier 3, requires serviceSecret) — WEBCHAT + Slack T5 */
  readonly channels: ChannelsResource;

  constructor(config: MessagingClientConfig) {
    this.http = new HttpClient(config);

    this.conversations = new ConversationsResource(this.http);
    this.messages = new MessagesResource(this.http);
    this.connections = new ConnectionsResource(this.http);
    this.contacts = new ContactsResource(this.http);
    this.templates = new TemplatesResource(this.http);
    this.media = new MediaResource(this.http);
    this.agents = new AgentsResource(this.http);
    this.webhookEvents = new WebhookEventsResource(this.http);
    this.auditLog = new AuditLogResource(this.http);
    this.metrics = new MetricsResource(this.http);
    this.realtime = new RealtimeResource(this.http);
    this.platform = new PlatformResource(this.http);
    this.channels = new ChannelsResource(this.http);
  }
}
