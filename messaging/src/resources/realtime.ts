import type { HttpClient, ApiResponse } from '../http.js';
import type { RealtimeToken, CreateRealtimeTokenData } from '../types/index.js';

export class RealtimeResource {
  constructor(private http: HttpClient) {}

  async createToken(data: CreateRealtimeTokenData): Promise<ApiResponse<RealtimeToken>> {
    return this.http.post('/api/v1/realtime/token', data);
  }
}
