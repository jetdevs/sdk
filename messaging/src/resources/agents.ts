import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type { AgentStatus, AgentStats, AgentPresence } from '../types/index.js';

export class AgentsResource {
  constructor(private http: HttpClient) {}

  async listPresence(): Promise<PaginatedResponse<AgentStatus>> {
    return this.http.get('/api/v1/agents/presence');
  }

  async updatePresence(userId: string, presence: AgentPresence): Promise<ApiResponse<AgentStatus>> {
    return this.http.patch(`/api/v1/agents/${userId}/presence`, { presence });
  }

  async getStats(userId: string): Promise<ApiResponse<AgentStats>> {
    return this.http.get(`/api/v1/agents/${userId}/stats`);
  }
}
