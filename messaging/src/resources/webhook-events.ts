import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type { WebhookEvent, ListWebhookEventsParams } from '../types/index.js';

export class WebhookEventsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListWebhookEventsParams): Promise<PaginatedResponse<WebhookEvent>> {
    return this.http.get('/api/v1/webhook-events', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<WebhookEvent>> {
    return this.http.get(`/api/v1/webhook-events/${uuid}`);
  }

  async retry(uuid: string): Promise<ApiResponse<WebhookEvent>> {
    return this.http.post(`/api/v1/webhook-events/${uuid}/retry`);
  }
}
