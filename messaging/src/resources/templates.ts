import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type {
  Template,
  CreateTemplateData,
  UpdateTemplateData,
  ListTemplatesParams,
  SendTemplateData,
  Message,
} from '../types/index.js';

export class TemplatesResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListTemplatesParams): Promise<PaginatedResponse<Template>> {
    return this.http.get('/api/v1/templates', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<Template>> {
    return this.http.get(`/api/v1/templates/${uuid}`);
  }

  async create(data: CreateTemplateData): Promise<ApiResponse<Template>> {
    return this.http.post('/api/v1/templates', data);
  }

  async update(uuid: string, data: UpdateTemplateData): Promise<ApiResponse<Template>> {
    return this.http.patch(`/api/v1/templates/${uuid}`, data);
  }

  async delete(uuid: string): Promise<void> {
    await this.http.delete(`/api/v1/templates/${uuid}`);
  }

  async submit(uuid: string): Promise<ApiResponse<Template>> {
    return this.http.post(`/api/v1/templates/${uuid}/submit`);
  }

  async send(data: SendTemplateData): Promise<ApiResponse<Message>> {
    return this.http.post('/api/v1/messages/template', data);
  }
}
