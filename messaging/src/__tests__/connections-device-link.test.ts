import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionsResource } from '../resources/connections.js';
import type { HttpClient } from '../http.js';

function createMockHttp(): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient;
}

describe('ConnectionsResource', () => {
  let http: HttpClient;
  let connections: ConnectionsResource;

  beforeEach(() => {
    http = createMockHttp();
    connections = new ConnectionsResource(http);
  });

  // ------------------------------------------------------------------
  // Existing methods still work (backward compatibility)
  // ------------------------------------------------------------------

  describe('existing methods (backward compatibility)', () => {
    it('list() calls GET /api/v1/connections', async () => {
      const mockResponse = { data: [], pagination: { page: 1, pageSize: 20, total: 0, hasMore: false }, meta: { requestId: 'r1', timestamp: '2026-01-01' } };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.list({ channel: 'WHATSAPP' });
      expect(http.get).toHaveBeenCalledWith('/api/v1/connections', { channel: 'WHATSAPP' });
      expect(result).toEqual(mockResponse);
    });

    it('get() calls GET /api/v1/connections/:uuid', async () => {
      const mockResponse = { data: { uuid: 'c1' }, meta: { requestId: 'r1', timestamp: '2026-01-01' } };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.get('c1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/connections/c1');
      expect(result).toEqual(mockResponse);
    });

    it('create() calls POST /api/v1/connections', async () => {
      const data = { channel: 'TELEGRAM' as const, name: 'test', config: {} };
      vi.mocked(http.post).mockResolvedValue({ data: { uuid: 'c2' } });

      await connections.create(data);
      expect(http.post).toHaveBeenCalledWith('/api/v1/connections', data);
    });

    it('delete() calls DELETE /api/v1/connections/:uuid', async () => {
      vi.mocked(http.delete).mockResolvedValue(undefined);

      await connections.delete('c1');
      expect(http.delete).toHaveBeenCalledWith('/api/v1/connections/c1');
    });

    it('test() calls POST /api/v1/connections/test', async () => {
      const data = { channel: 'WHATSAPP' as const, config: { token: 'abc' } };
      vi.mocked(http.post).mockResolvedValue({ data: { success: true, message: 'ok' } });

      await connections.test(data);
      expect(http.post).toHaveBeenCalledWith('/api/v1/connections/test', data);
    });
  });

  // ------------------------------------------------------------------
  // Device Link methods
  // ------------------------------------------------------------------

  describe('startDeviceLink()', () => {
    it('calls POST /api/v1/connections/device-link/start with name', async () => {
      const mockResponse = {
        data: {
          connectionUuid: 'conn-1',
          linkId: 'link-1',
          qrDataUrl: 'data:image/png;base64,abc',
          expiresAt: '2026-03-17T12:00:00Z',
        },
        meta: { requestId: 'r1', timestamp: '2026-03-17T11:00:00Z' },
      };
      vi.mocked(http.post).mockResolvedValue(mockResponse);

      const result = await connections.startDeviceLink({ name: 'My WhatsApp' });

      expect(http.post).toHaveBeenCalledWith('/api/v1/connections/device-link/start', { name: 'My WhatsApp' });
      expect(result.data.connectionUuid).toBe('conn-1');
      expect(result.data.linkId).toBe('link-1');
      expect(result.data.qrDataUrl).toContain('data:image');
      expect(result.data.expiresAt).toBeDefined();
    });
  });

  describe('checkDeviceLinkStatus()', () => {
    it('calls GET /api/v1/connections/device-link/{linkId}/status', async () => {
      const mockResponse = {
        data: { status: 'waiting_scan' as const, qrDataUrl: 'data:image/png;base64,xyz' },
        meta: { requestId: 'r2', timestamp: '2026-03-17T11:00:00Z' },
      };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.checkDeviceLinkStatus('link-1');

      expect(http.get).toHaveBeenCalledWith('/api/v1/connections/device-link/link-1/status');
      expect(result.data.status).toBe('waiting_scan');
      expect(result.data.qrDataUrl).toBeDefined();
    });

    it('returns connected status with phone number', async () => {
      const mockResponse = {
        data: { status: 'connected' as const, phoneNumber: '+1234567890', jid: '1234567890@s.whatsapp.net' },
        meta: { requestId: 'r3', timestamp: '2026-03-17T11:01:00Z' },
      };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.checkDeviceLinkStatus('link-1');

      expect(result.data.status).toBe('connected');
      expect(result.data.phoneNumber).toBe('+1234567890');
      expect(result.data.jid).toBe('1234567890@s.whatsapp.net');
    });

    it('returns expired status', async () => {
      const mockResponse = {
        data: { status: 'expired' as const },
        meta: { requestId: 'r4', timestamp: '2026-03-17T11:05:00Z' },
      };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.checkDeviceLinkStatus('link-1');
      expect(result.data.status).toBe('expired');
    });

    it('returns error status with error message', async () => {
      const mockResponse = {
        data: { status: 'error' as const, error: 'Device rejected pairing' },
        meta: { requestId: 'r5', timestamp: '2026-03-17T11:05:00Z' },
      };
      vi.mocked(http.get).mockResolvedValue(mockResponse);

      const result = await connections.checkDeviceLinkStatus('link-1');
      expect(result.data.status).toBe('error');
      expect(result.data.error).toBe('Device rejected pairing');
    });
  });

  describe('refreshQr()', () => {
    it('calls POST /api/v1/connections/device-link/{linkId}/refresh-qr', async () => {
      const mockResponse = {
        data: { qrDataUrl: 'data:image/png;base64,newqr', expiresAt: '2026-03-17T12:05:00Z' },
        meta: { requestId: 'r6', timestamp: '2026-03-17T12:00:00Z' },
      };
      vi.mocked(http.post).mockResolvedValue(mockResponse);

      const result = await connections.refreshQr('link-1');

      expect(http.post).toHaveBeenCalledWith('/api/v1/connections/device-link/link-1/refresh-qr');
      expect(result.data.qrDataUrl).toContain('data:image');
      expect(result.data.expiresAt).toBeDefined();
    });
  });

  describe('disconnectDeviceLink()', () => {
    it('calls POST /api/v1/connections/{uuid}/disconnect-device', async () => {
      vi.mocked(http.post).mockResolvedValue(undefined);

      await connections.disconnectDeviceLink('conn-1');

      expect(http.post).toHaveBeenCalledWith('/api/v1/connections/conn-1/disconnect-device');
    });

    it('returns void (no response body)', async () => {
      vi.mocked(http.post).mockResolvedValue(undefined);

      const result = await connections.disconnectDeviceLink('conn-1');
      expect(result).toBeUndefined();
    });
  });

  // ------------------------------------------------------------------
  // Callback Management methods
  // ------------------------------------------------------------------

  describe('registerCallback()', () => {
    it('calls POST /api/v1/connections/{uuid}/callback with callbackUrl and callbackSecret', async () => {
      const mockConnection = {
        data: {
          uuid: 'conn-1',
          channel: 'TELEGRAM',
          name: 'Test',
          status: 'ACTIVE',
          webhookUrl: null,
          isDefault: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-03-17',
        },
        meta: { requestId: 'r7', timestamp: '2026-03-17T12:00:00Z' },
      };
      vi.mocked(http.post).mockResolvedValue(mockConnection);

      const result = await connections.registerCallback('conn-1', {
        callbackUrl: 'https://cadra.example.com/api/v1/channels/callback',
        callbackSecret: 'secret-abc-123',
      });

      expect(http.post).toHaveBeenCalledWith('/api/v1/connections/conn-1/callback', {
        callbackUrl: 'https://cadra.example.com/api/v1/channels/callback',
        callbackSecret: 'secret-abc-123',
      });
      expect(result.data.uuid).toBe('conn-1');
    });
  });

  describe('deregisterCallback()', () => {
    it('calls DELETE /api/v1/connections/{uuid}/callback', async () => {
      const mockConnection = {
        data: {
          uuid: 'conn-1',
          channel: 'TELEGRAM',
          name: 'Test',
          status: 'ACTIVE',
          webhookUrl: null,
          isDefault: false,
          createdAt: '2026-01-01',
          updatedAt: '2026-03-17',
        },
        meta: { requestId: 'r8', timestamp: '2026-03-17T12:00:00Z' },
      };
      vi.mocked(http.delete).mockResolvedValue(mockConnection);

      const result = await connections.deregisterCallback('conn-1');

      expect(http.delete).toHaveBeenCalledWith('/api/v1/connections/conn-1/callback');
      expect(result.data.uuid).toBe('conn-1');
    });
  });

  // ------------------------------------------------------------------
  // New channel types
  // ------------------------------------------------------------------

  describe('new channel types', () => {
    it('accepts WHATSAPP_DEVICE as channel type in list params', async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [], pagination: {}, meta: {} });

      await connections.list({ channel: 'WHATSAPP_DEVICE' });
      expect(http.get).toHaveBeenCalledWith('/api/v1/connections', { channel: 'WHATSAPP_DEVICE' });
    });

    it('accepts SLACK as channel type', async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [], pagination: {}, meta: {} });

      await connections.list({ channel: 'SLACK' });
      expect(http.get).toHaveBeenCalledWith('/api/v1/connections', { channel: 'SLACK' });
    });

    it('accepts DISCORD as channel type', async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [], pagination: {}, meta: {} });

      await connections.list({ channel: 'DISCORD' });
      expect(http.get).toHaveBeenCalledWith('/api/v1/connections', { channel: 'DISCORD' });
    });

    it('accepts WHATSAPP_DEVICE in create()', async () => {
      vi.mocked(http.post).mockResolvedValue({ data: { uuid: 'c1' } });

      await connections.create({ channel: 'WHATSAPP_DEVICE', name: 'Device WA', config: {} });
      expect(http.post).toHaveBeenCalledWith('/api/v1/connections', {
        channel: 'WHATSAPP_DEVICE',
        name: 'Device WA',
        config: {},
      });
    });
  });
});
