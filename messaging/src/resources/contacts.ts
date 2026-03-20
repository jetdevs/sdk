import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type {
  Contact,
  CreateContactData,
  UpdateContactData,
  MergeContactsData,
  ListContactsParams,
  Conversation,
} from '../types/index.js';

export class ContactsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListContactsParams): Promise<PaginatedResponse<Contact>> {
    return this.http.get('/api/v1/contacts', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<Contact>> {
    return this.http.get(`/api/v1/contacts/${uuid}`);
  }

  async create(data: CreateContactData): Promise<ApiResponse<Contact>> {
    return this.http.post('/api/v1/contacts', data);
  }

  async update(uuid: string, data: UpdateContactData): Promise<ApiResponse<Contact>> {
    return this.http.patch(`/api/v1/contacts/${uuid}`, data);
  }

  async merge(data: MergeContactsData): Promise<ApiResponse<Contact>> {
    return this.http.post('/api/v1/contacts/merge', data);
  }

  async listConversations(uuid: string): Promise<PaginatedResponse<Conversation>> {
    return this.http.get(`/api/v1/contacts/${uuid}/conversations`);
  }
}
