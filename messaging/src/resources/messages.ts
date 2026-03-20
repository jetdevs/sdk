import type { HttpClient, ApiResponse, CursorPaginatedResponse } from '../http.js';
import type {
  Message,
  SendMessageData,
  SendTemplateData,
  AddNoteData,
  ListMessagesParams,
} from '../types/index.js';

export class MessagesResource {
  constructor(private http: HttpClient) {}

  async list(conversationUuid: string, params?: ListMessagesParams): Promise<CursorPaginatedResponse<Message>> {
    return this.http.get(
      `/api/v1/conversations/${conversationUuid}/messages`,
      params as Record<string, unknown>,
    );
  }

  async get(uuid: string): Promise<ApiResponse<Message>> {
    return this.http.get(`/api/v1/messages/${uuid}`);
  }

  async send(data: SendMessageData): Promise<ApiResponse<Message>> {
    return this.http.post('/api/v1/messages', data);
  }

  async sendTemplate(data: SendTemplateData): Promise<ApiResponse<Message>> {
    return this.http.post('/api/v1/messages/template', data);
  }

  async addNote(conversationUuid: string, data: AddNoteData): Promise<ApiResponse<Message>> {
    return this.http.post(`/api/v1/conversations/${conversationUuid}/notes`, data);
  }

  async retry(uuid: string): Promise<ApiResponse<Message>> {
    return this.http.post(`/api/v1/messages/${uuid}/retry`);
  }

  async delete(uuid: string): Promise<void> {
    await this.http.delete(`/api/v1/messages/${uuid}`);
  }
}
