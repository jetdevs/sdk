import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type {
  Conversation,
  CreateConversationData,
  UpdateConversationData,
  ListConversationsParams,
  AssignConversationData,
  UnreadCountResponse,
} from '../types/index.js';

export class ConversationsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListConversationsParams): Promise<PaginatedResponse<Conversation>> {
    return this.http.get('/api/v1/conversations', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<Conversation>> {
    return this.http.get(`/api/v1/conversations/${uuid}`);
  }

  async create(data: CreateConversationData): Promise<ApiResponse<Conversation>> {
    return this.http.post('/api/v1/conversations', data);
  }

  async update(uuid: string, data: UpdateConversationData): Promise<ApiResponse<Conversation>> {
    return this.http.patch(`/api/v1/conversations/${uuid}`, data);
  }

  async assign(uuid: string, data: AssignConversationData): Promise<ApiResponse<Conversation>> {
    return this.http.post(`/api/v1/conversations/${uuid}/assign`, data);
  }

  async unassign(uuid: string): Promise<ApiResponse<Conversation>> {
    return this.http.post(`/api/v1/conversations/${uuid}/unassign`);
  }

  async close(uuid: string): Promise<ApiResponse<Conversation>> {
    return this.http.post(`/api/v1/conversations/${uuid}/close`);
  }

  async reopen(uuid: string): Promise<ApiResponse<Conversation>> {
    return this.http.post(`/api/v1/conversations/${uuid}/reopen`);
  }

  async unreadCount(): Promise<ApiResponse<UnreadCountResponse>> {
    return this.http.get('/api/v1/conversations/unread-count');
  }
}
