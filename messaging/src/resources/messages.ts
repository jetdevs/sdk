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
    // Canonical route is conversation-scoped: POST /api/v1/conversations/:uuid/messages
    // (message-api/src/routes/v1/messages.ts). conversationUuid is carried in the path,
    // not the body — the rest of SendMessageData is the body. Signature stays stable so
    // existing consumers (CRM operator sends, AI-responder write-back) are unaffected.
    const { conversationUuid, ...body } = data;
    return this.http.post(`/api/v1/conversations/${conversationUuid}/messages`, body);
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
