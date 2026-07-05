import type { HttpClient, ApiResponse, PaginatedResponse, CursorPaginatedResponse } from '../http.js';
import type {
  PlatformMetrics,
  PlatformConnection,
  ListPlatformConnectionsParams,
  ConnectionHealth,
  WebhookEvent,
  ListWebhookEventsParams,
  QueueInfo,
  QueueJob,
  ListQueueJobsParams,
  RateLimitEntry,
  SetRateLimitData,
  AuditLogEntry,
  QueryAuditLogParams,
  Template,
  ListPlatformTemplatesParams,
  PlatformConversation,
  PlatformConversationsPage,
  ListPlatformConversationsParams,
  ListMessagesParams,
  Message,
  RealtimeToken,
} from '../types/index.js';

/** Tier 2 platform operations (requires platformKey / X-Platform-Key). */
export class PlatformResource {
  readonly metrics: PlatformMetricsResource;
  readonly channels: PlatformChannelsResource;
  readonly webhookEvents: PlatformWebhookEventsResource;
  readonly queues: PlatformQueuesResource;
  readonly rateLimits: PlatformRateLimitsResource;
  readonly auditLog: PlatformAuditLogResource;
  readonly templates: PlatformTemplatesResource;
  /** Cross-org conversation reads (Phase B) — READ-ONLY by design. */
  readonly conversations: PlatformConversationsResource;
  /** Scoped SSE token mint for the cross-org stream (Phase B). */
  readonly realtime: PlatformRealtimeResource;

  constructor(http: HttpClient) {
    this.metrics = new PlatformMetricsResource(http);
    this.channels = new PlatformChannelsResource(http);
    this.webhookEvents = new PlatformWebhookEventsResource(http);
    this.queues = new PlatformQueuesResource(http);
    this.rateLimits = new PlatformRateLimitsResource(http);
    this.auditLog = new PlatformAuditLogResource(http);
    this.templates = new PlatformTemplatesResource(http);
    this.conversations = new PlatformConversationsResource(http);
    this.realtime = new PlatformRealtimeResource(http);
  }
}

class PlatformMetricsResource {
  constructor(private http: HttpClient) {}

  async get(params?: { period?: string }): Promise<ApiResponse<PlatformMetrics>> {
    return this.http.get('/api/v1/platform/metrics', params as Record<string, unknown>);
  }
}

class PlatformChannelsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListPlatformConnectionsParams): Promise<PaginatedResponse<PlatformConnection>> {
    return this.http.get('/api/v1/platform/channels', params as Record<string, unknown>);
  }

  async getHealth(params?: { status?: string }): Promise<PaginatedResponse<ConnectionHealth>> {
    return this.http.get('/api/v1/platform/channels/health', params as Record<string, unknown>);
  }

  async forceReconnect(uuid: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.http.post(`/api/v1/platform/channels/${uuid}/force-reconnect`);
  }

  async forceDisconnect(uuid: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.http.post(`/api/v1/platform/channels/${uuid}/force-disconnect`);
  }
}

class PlatformWebhookEventsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListWebhookEventsParams): Promise<PaginatedResponse<WebhookEvent>> {
    return this.http.get('/api/v1/platform/webhook-events', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<WebhookEvent>> {
    return this.http.get(`/api/v1/platform/webhook-events/${uuid}`);
  }

  async retry(uuid: string): Promise<ApiResponse<WebhookEvent>> {
    return this.http.post(`/api/v1/platform/webhook-events/${uuid}/retry`);
  }

  async bulkRetry(uuids: string[]): Promise<ApiResponse<{ retried: number }>> {
    return this.http.post('/api/v1/platform/webhook-events/bulk-retry', { uuids });
  }
}

class PlatformQueuesResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<ApiResponse<QueueInfo[]>> {
    return this.http.get('/api/v1/platform/queues');
  }

  async getJobs(queueName: string, params?: ListQueueJobsParams): Promise<PaginatedResponse<QueueJob>> {
    return this.http.get(`/api/v1/platform/queues/${queueName}/jobs`, params as Record<string, unknown>);
  }

  async pause(queueName: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.http.post(`/api/v1/platform/queues/${queueName}/pause`);
  }

  async resume(queueName: string): Promise<ApiResponse<{ success: boolean }>> {
    return this.http.post(`/api/v1/platform/queues/${queueName}/resume`);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    await this.http.delete(`/api/v1/platform/queues/${queueName}/jobs/${jobId}`);
  }
}

class PlatformRateLimitsResource {
  constructor(private http: HttpClient) {}

  async list(): Promise<PaginatedResponse<RateLimitEntry>> {
    return this.http.get('/api/v1/platform/rate-limits');
  }

  async set(orgId: string, data: SetRateLimitData): Promise<ApiResponse<RateLimitEntry>> {
    return this.http.put(`/api/v1/platform/rate-limits/${orgId}`, data);
  }

  async reset(orgId: string): Promise<void> {
    await this.http.delete(`/api/v1/platform/rate-limits/${orgId}`);
  }
}

class PlatformAuditLogResource {
  constructor(private http: HttpClient) {}

  async query(params?: QueryAuditLogParams): Promise<PaginatedResponse<AuditLogEntry>> {
    return this.http.get('/api/v1/platform/audit-log', params as Record<string, unknown>);
  }
}

class PlatformTemplatesResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListPlatformTemplatesParams): Promise<PaginatedResponse<Template>> {
    return this.http.get('/api/v1/platform/templates', params as Record<string, unknown>);
  }

  async approve(uuid: string): Promise<ApiResponse<Template>> {
    return this.http.post(`/api/v1/platform/templates/${uuid}/approve`);
  }

  async reject(uuid: string, data: { reason: string }): Promise<ApiResponse<Template>> {
    return this.http.post(`/api/v1/platform/templates/${uuid}/reject`, data);
  }
}

/**
 * Cross-org conversation reads (Phase B, spec Part 3). View-only is structural:
 * this resource deliberately has NO send/assign/status/note method — the
 * platform tier has no such route.
 */
class PlatformConversationsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListPlatformConversationsParams): Promise<PlatformConversationsPage> {
    return this.http.get('/api/v1/platform/conversations', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<PlatformConversation>> {
    return this.http.get(`/api/v1/platform/conversations/${uuid}`);
  }

  async messages(uuid: string, params?: ListMessagesParams): Promise<CursorPaginatedResponse<Message>> {
    return this.http.get(`/api/v1/platform/conversations/${uuid}/messages`, params as Record<string, unknown>);
  }
}

class PlatformRealtimeResource {
  constructor(private http: HttpClient) {}

  async createToken(data: { userId: string }): Promise<ApiResponse<RealtimeToken>> {
    return this.http.post('/api/v1/platform/realtime/token', data);
  }
}
