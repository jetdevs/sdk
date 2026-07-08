import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlatformResource } from '../resources/platform.js';
import { HttpClient } from '../http.js';
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

describe('PlatformResource — console mutations (Phase A)', () => {
  let http: HttpClient;
  let platform: PlatformResource;

  beforeEach(() => {
    http = createMockHttp();
    platform = new PlatformResource(http);
  });

  it('takeOver() POSTs /take-over with { userId } and returns the full platform row', async () => {
    const row = {
      data: {
        uuid: 'c1',
        handoffState: 'human_active',
        responderMode: 'human',
        takenOverByUserId: '7',
        binding: { kind: 'agent', name: 'Aria', agentUuid: 'a1' },
      },
      meta: { requestId: 'r', timestamp: 't' },
    };
    vi.mocked(http.post).mockResolvedValue(row);

    const result = await platform.conversations.takeOver('c1', { userId: '7' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/take-over', { userId: '7' });
    // The mutation return carries the badge fields A8 renders from.
    expect(result.data.handoffState).toBe('human_active');
    expect(result.data.responderMode).toBe('human');
    expect(result.data.takenOverByUserId).toBe('7');
    expect(result.data.binding).toEqual({ kind: 'agent', name: 'Aria', agentUuid: 'a1' });
  });

  it('releaseToAi() POSTs /release-to-ai with { userId }', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { uuid: 'c1', handoffState: 'none', responderMode: 'ai' },
      meta: { requestId: 'r', timestamp: 't' },
    });
    await platform.conversations.releaseToAi('c1', { userId: '7' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/release-to-ai', { userId: '7' });
  });

  it('dismissEscalation() POSTs /dismiss-escalation with { userId }', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { uuid: 'c1', handoffState: 'none', responderMode: 'ai' },
      meta: { requestId: 'r', timestamp: 't' },
    });
    await platform.conversations.dismissEscalation('c1', { userId: '7' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/dismiss-escalation', { userId: '7' });
  });

  it('sendMessage() POSTs /messages and returns the 202 accept-shape (NOT a full Message)', async () => {
    const accept = {
      data: { messageUuid: 'm1', deliveryStatus: 'PENDING' },
      meta: { requestId: 'r', timestamp: 't' },
    };
    vi.mocked(http.post).mockResolvedValue(accept);

    const result = await platform.conversations.sendMessage('c1', {
      userId: '7',
      content: 'hello',
      messageType: 'TEXT',
      metadata: { note: 'x' },
    });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/messages', {
      userId: '7',
      content: 'hello',
      messageType: 'TEXT',
      metadata: { note: 'x' },
    });
    expect(result.data).toEqual({ messageUuid: 'm1', deliveryStatus: 'PENDING' });
    // Accept-shape only — it is deliberately not a Message row.
    expect(result.data).not.toHaveProperty('authorType');
    expect(result.data).not.toHaveProperty('direction');
  });

  it('sendMessage() forwards only the provided fields when messageType/metadata are omitted', async () => {
    vi.mocked(http.post).mockResolvedValue({
      data: { messageUuid: 'm2', deliveryStatus: 'PENDING' },
      meta: { requestId: 'r', timestamp: 't' },
    });
    await platform.conversations.sendMessage('c1', { userId: '7', content: 'hi' });
    expect(http.post).toHaveBeenCalledWith('/api/v1/platform/conversations/c1/messages', {
      userId: '7',
      content: 'hi',
    });
  });
});

describe('MessagingApiError — a 409 is catchable as a conflict (Phase A)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('a 409 mutation response throws a MessagingApiError carrying status 409 + the service message', async () => {
    // A real HttpClient over a mocked fetch: proves the CRM's handleSdkError
    // contract (keys off err.status === 409 → TRPC CONFLICT), not just resource
    // passthrough. 409 is NOT in the retry set, so fetch fires exactly once.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => null },
      json: async () => ({
        error: { code: 'CONFLICT', message: 'Conversation already taken over by 7' },
        meta: { requestId: 'r1' },
      }),
    }) as unknown as typeof fetch;

    const http = new HttpClient({ baseUrl: 'https://msg.example.test', platformKey: 'k', maxRetries: 0 });
    const platform = new PlatformResource(http);

    await expect(platform.conversations.takeOver('c1', { userId: '7' })).rejects.toMatchObject({
      name: 'MessagingApiError',
      status: 409,
      code: 'CONFLICT',
      message: 'Conversation already taken over by 7',
    });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('a 409 on sendMessage (reply-while-AI) also surfaces status 409', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => null },
      json: async () => ({
        error: { code: 'CONFLICT', message: 'Conversation is AI-driven; take over before replying' },
        meta: { requestId: 'r2' },
      }),
    }) as unknown as typeof fetch;

    const http = new HttpClient({ baseUrl: 'https://msg.example.test', platformKey: 'k', maxRetries: 0 });
    const platform = new PlatformResource(http);

    await expect(
      platform.conversations.sendMessage('c1', { userId: '7', content: 'hi' }),
    ).rejects.toMatchObject({ status: 409, message: 'Conversation is AI-driven; take over before replying' });
  });

  it('a 409 in the msg-api/Fastify TOP-LEVEL shape ({message}, not {error:{message}}) still surfaces the message', async () => {
    // msg-api (Fastify) serializes errors as { statusCode, code, error:"Conflict",
    // message } — message/code at TOP LEVEL. The SDK must NOT drop it to "HTTP 409"
    // (the CRM's takeover-conflict-banner renders this text). The tests above mock
    // only the nested { error:{ message } } envelope — that is exactly why this
    // regressed against the real service; assert the real Fastify shape here too.
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => null },
      json: async () => ({
        statusCode: 409,
        code: 'CONFLICT',
        error: 'Conflict',
        message: 'Conversation already taken over by 2185',
      }),
    }) as unknown as typeof fetch;

    const http = new HttpClient({ baseUrl: 'https://msg.example.test', platformKey: 'k', maxRetries: 0 });
    const platform = new PlatformResource(http);

    await expect(platform.conversations.takeOver('c1', { userId: '7' })).rejects.toMatchObject({
      name: 'MessagingApiError',
      status: 409,
      code: 'CONFLICT',
      message: 'Conversation already taken over by 2185',
    });
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

describe('SystemEventType — handoff turns on Message (Phase A)', () => {
  it('a SYSTEM handoff.joined Message carries systemEventType and type-checks', () => {
    // Compile-time assertion: systemEventType must accept a SystemEventType.
    const joined: Message = {
      uuid: 'm2',
      conversationUuid: 'c1',
      channel: 'WHATSAPP',
      direction: 'OUTBOUND',
      messageType: 'TEXT',
      content: 'A human teammate has joined the conversation.',
      deliveryStatus: 'SENT',
      authorType: 'SYSTEM',
      authorId: null,
      systemEventType: 'handoff.joined',
      replyToUuid: null,
      attachments: [],
      metadata: {},
      isInternal: false,
      createdAt: '2026-07-06T10:00:00Z',
      updatedAt: '2026-07-06T10:00:00Z',
    };
    expect(joined.systemEventType).toBe('handoff.joined');
  });

  it('systemEventType is optional/nullable — an ordinary row omits it', () => {
    const ordinary: Message = {
      uuid: 'm3',
      conversationUuid: 'c1',
      channel: 'WHATSAPP',
      direction: 'INBOUND',
      messageType: 'TEXT',
      content: 'hello',
      deliveryStatus: 'DELIVERED',
      authorType: 'CONTACT',
      authorId: null,
      replyToUuid: null,
      attachments: [],
      metadata: {},
      isInternal: false,
      createdAt: '2026-07-06T10:00:00Z',
      updatedAt: '2026-07-06T10:00:00Z',
    };
    expect(ordinary.systemEventType).toBeUndefined();
  });
});
