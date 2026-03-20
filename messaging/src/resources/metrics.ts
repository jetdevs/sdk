import type { HttpClient, ApiResponse } from '../http.js';
import type { OrgMetrics } from '../types/index.js';

export class MetricsResource {
  constructor(private http: HttpClient) {}

  async get(params?: { period?: string }): Promise<ApiResponse<OrgMetrics>> {
    return this.http.get('/api/v1/metrics', params as Record<string, unknown>);
  }
}
