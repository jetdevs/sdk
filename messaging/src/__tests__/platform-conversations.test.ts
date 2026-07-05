import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlatformResource } from '../resources/platform.js';
import type { HttpClient } from '../http.js';
import type { Message } from '../types/index.js';

function createMockHttp(): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient;
}

describe('PlatformResource — cross-org conversations (Phase B)', () => {
  let http: HttpClient;
  let platform: PlatformResource;

  beforeEach(() => {
    http = createMockHttp();
    platform = new PlatformResource(http);
  });

  it('conversations.list() calls GET /api/v1/platform/conversations with cursor params', async () => {
    const mockResponse = {
      data: [],
      meta: { requestId: 'r1', timestamp: '2026-07-04' },
      pagination: { cursor: null, hasMore: false, limit: 50 },
      facets: { orgs: [] },
    };
    vi.mocked(http.get).mockResolvedValue(mockResponse);

    const result = await platform.conversations.list({
      cursor: 'abc', limit: 50, orgId: 'org-uuid', channel: 'WHATSAPP', search: 'alice',
    });
    expect(http.get).toHaveBeenCalledWith('/api/v1/platform/conversations', {
      cursor: 'abc', limit: 50, orgId: 'org-uuid', channel: 'WHATSAPP', search: 'alice',
    });
    expect(result).toEqual(mockResponse);
  });

  it('conversations.get() calls GET /api/v1/platform/conversations/:uuid', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: { uuid: 'c1' }, meta: { requestId: 'r', timestamp: 't' } });
    await platform.conversations.get('c1');
    expect(http.get).toHaveBeenCalledWith('/api/v1/platform/conversations/c1');
  });

  it('conversations.messages() calls GET /api/v1/platform/conversations/:uuid/messages', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: [], meta: { requestId: 'r', timestamp: 't' },
      pagination: { cursor: null, hasMore: false, limit: 50 },
    });
    await platform.conversations.messages('c1', { limit: 50, direction: 'before' });
    expect(http.get).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/messages', {
      limit: 50, direction: 'before',
    });
  });

  it('realtime.createToken() calls POST /api/v1/platform/realtime/token', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { token: 'jwt', expiresAt: '2026-07-04T00:05:00Z' },
      meta: { requestId: 'r', timestamp: 't' },
    });
    await platform.realtime.createToken({ userId: '7' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/realtime/token', { userId: '7' });
  });
});

describe('AuthorType — AI passthrough (Phase B Step 0)', () => {
  it('a Message with authorType: "AI" type-checks and is NOT normalized to BOT', () => {
    // Compile-time assertion: this object must be assignable to Message. If the
    // AuthorType union does not include 'AI', tsc (pnpm typecheck) fails here.
    const aiReply: Message = {
      uuid: 'm1',
      conversationUuid: 'c1',
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      messageType: 'TEXT',
      content: 'Hi, this is the AI.',
      deliveryStatus: 'SENT',
      authorType: 'AI',
      authorId: null,
      replyToUuid: null,
      attachments: [],
      metadata: {},
      isInternal: false,
      createdAt: '2026-07-04T10:00:00Z',
      updatedAt: '2026-07-04T10:00:00Z',
    };
    expect(aiReply.authorType).toBe('AI');
  });
});
