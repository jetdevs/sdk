import { describe, it, expect, vi, afterEach } from 'vitest';
import { HttpClient } from '../http.js';
import { ConnectionsResource } from '../resources/connections.js';

function mockFetch() {
  const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  vi.stubGlobal('fetch', f);
  return f;
}
const client = () => new HttpClient({ baseUrl: 'http://x', apiKey: 'k', orgId: 'o', maxRetries: 0 } as never);

afterEach(() => vi.unstubAllGlobals());

describe('HttpClient Content-Type', () => {
  it('DELETE sends no Content-Type and no body', async () => {
    const f = mockFetch();
    await client().delete('/api/v1/connections/u1');
    const init = f.mock.calls[0][1];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.headers.Authorization).toBe('Bearer k');
    expect(init.headers['X-Org-Id']).toBe('o');
  });

  it('GET sends no Content-Type', async () => {
    const f = mockFetch();
    await client().get('/a');
    expect(f.mock.calls[0][1].headers['Content-Type']).toBeUndefined();
  });

  it.each(['post', 'put', 'patch'] as const)('%s with body keeps Content-Type', async (m) => {
    const f = mockFetch();
    await client()[m]('/a', { a: 1 });
    const init = f.mock.calls[0][1];
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
});

describe('ConnectionsResource.setStatus', () => {
  it('calls PUT /status with {status}', async () => {
    const http = { put: vi.fn().mockResolvedValue({ data: { connectionUuid: 'u1', status: 'PAUSED' } }) };
    const res = await new ConnectionsResource(http as never).setStatus('u1', 'PAUSED');
    expect(http.put).toHaveBeenCalledWith('/api/v1/connections/u1/status', { status: 'PAUSED' });
    expect(res.data.status).toBe('PAUSED');
  });
});
