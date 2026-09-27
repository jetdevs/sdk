import type { HttpClient, ApiResponse } from '../http.js';
import type { Media } from '../types/index.js';

export class MediaResource {
  constructor(private http: HttpClient) {}

  async get(uuid: string): Promise<ApiResponse<Media>> {
    return this.http.get(`/api/v1/media/${uuid}`);
  }

  async delete(uuid: string): Promise<void> {
    await this.http.delete(`/api/v1/media/${uuid}`);
  }

  // Note: upload requires multipart/form-data, handled separately
  // since the base HttpClient uses JSON. Consuming apps can use
  // the upload endpoint directly or extend this class.
}
