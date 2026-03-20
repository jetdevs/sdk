import type { HttpClient, PaginatedResponse } from '../http.js';
import type { AuditLogEntry, QueryAuditLogParams } from '../types/index.js';

export class AuditLogResource {
  constructor(private http: HttpClient) {}

  async query(params?: QueryAuditLogParams): Promise<PaginatedResponse<AuditLogEntry>> {
    return this.http.get('/api/v1/audit-log', params as Record<string, unknown>);
  }
}
