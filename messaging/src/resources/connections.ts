import type { HttpClient, ApiResponse, PaginatedResponse } from '../http.js';
import type {
  Connection,
  ConnectionHealth,
  CreateConnectionData,
  UpdateConnectionData,
  TestConnectionData,
  TestConnectionResult,
  ListConnectionsParams,
  StartDeviceLinkData,
  DeviceLinkResult,
  DeviceLinkStatusResult,
  RefreshQrResult,
  RegisterCallbackData,
} from '../types/index.js';

export class ConnectionsResource {
  constructor(private http: HttpClient) {}

  async list(params?: ListConnectionsParams): Promise<PaginatedResponse<Connection>> {
    return this.http.get('/api/v1/connections', params as Record<string, unknown>);
  }

  async get(uuid: string): Promise<ApiResponse<Connection>> {
    return this.http.get(`/api/v1/connections/${uuid}`);
  }

  async create(data: CreateConnectionData): Promise<ApiResponse<Connection>> {
    return this.http.post('/api/v1/connections', data);
  }

  async update(uuid: string, data: UpdateConnectionData): Promise<ApiResponse<Connection>> {
    return this.http.patch(`/api/v1/connections/${uuid}`, data);
  }

  async setIdentityGate(
    uuid: string,
    identityGate: 'connection_pin' | 'chat_identity' | null,
  ): Promise<ApiResponse<{ connectionUuid: string; identityGate: string | null }>> {
    return this.http.put(`/api/v1/connections/${uuid}/identity-gate`, { identityGate });
  }

  async delete(uuid: string): Promise<void> {
    await this.http.delete(`/api/v1/connections/${uuid}`);
  }

  async test(data: TestConnectionData): Promise<ApiResponse<TestConnectionResult>> {
    return this.http.post('/api/v1/connections/test', data);
  }

  async getHealth(uuid: string): Promise<ApiResponse<ConnectionHealth>> {
    return this.http.get(`/api/v1/connections/${uuid}/health`);
  }

  async reconnect(uuid: string): Promise<ApiResponse<Connection>> {
    return this.http.post(`/api/v1/channels/${uuid}/reconnect`);
  }

  // --- Device Link (WhatsApp QR pairing) ---

  /** Start a WhatsApp device-link QR pairing flow. */
  async startDeviceLink(data: StartDeviceLinkData): Promise<ApiResponse<DeviceLinkResult>> {
    return this.http.post('/api/v1/connections/device-link/start', data);
  }

  /** Poll the status of an active device-link pairing. */
  async checkDeviceLinkStatus(linkId: string): Promise<ApiResponse<DeviceLinkStatusResult>> {
    return this.http.get(`/api/v1/connections/device-link/${linkId}/status`);
  }

  /** Refresh an expired or expiring QR code for a device-link pairing. */
  async refreshQr(linkId: string): Promise<ApiResponse<RefreshQrResult>> {
    return this.http.post(`/api/v1/connections/device-link/${linkId}/refresh-qr`);
  }

  /** Disconnect a WhatsApp device link (logs out from WhatsApp). */
  async disconnectDeviceLink(connectionUuid: string): Promise<void> {
    await this.http.post(`/api/v1/connections/${connectionUuid}/disconnect-device`);
  }

  // --- Callback Management ---

  /** Register a callback URL on a connection for inbound message delivery. */
  async registerCallback(connectionUuid: string, data: RegisterCallbackData): Promise<ApiResponse<Connection>> {
    return this.http.post(`/api/v1/connections/${connectionUuid}/callback`, data);
  }

  /** Deregister the callback URL from a connection. */
  async deregisterCallback(connectionUuid: string): Promise<ApiResponse<Connection>> {
    return this.http.delete(`/api/v1/connections/${connectionUuid}/callback`);
  }

  /**
   * Send an outbound message through a connection's adapter.
   * msg-api handles the platform-specific delivery (Telegram sendMessage, etc.)
   */
  async send(
    connectionUuid: string,
    data: {
      recipientId: string;
      content: string;
      contentType?: string;
      threadId?: string;
      media?: Array<{ url: string; mimeType?: string; fileName?: string; caption?: string }>;
    },
  ): Promise<ApiResponse<{ success: boolean; externalMessageId?: string; error?: string }>> {
    return this.http.post(`/api/v1/connections/${connectionUuid}/send`, data);
  }
}
