import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessagesResource } from '../resources/messages.js';
import type { HttpClient } from '../http.js';
import type { SendMessageData } from '../types/index.js';

function createMockHttp(): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient;
}

const CONVERSATION_UUID = 'conv-1234';

describe('MessagesResource — SDK <-> service route reconciliation (STORY-012)', () => {
  let http: HttpClient;
  let messages: MessagesResource;

  beforeEach(() => {
    http = createMockHttp();
    messages = new MessagesResource(http);
  });

  // ------------------------------------------------------------------
  // send() route compat — canonical conversation-scoped path
  // ------------------------------------------------------------------

  // Accept-shape returned by the 202 service route (message-api SendAcceptResponseSchema).
  const acceptResponse = {
    data: { messageUuid: 'm1', deliveryStatus: 'QUEUED' as const },
    meta: { requestId: 'r1', timestamp: '2026-07-01' },
  };

  describe('send()', () => {
    it('POSTs the conversation-scoped service route /api/v1/conversations/:uuid/messages', async () => {
      vi.mocked(http.post).mockResolvedValue(acceptResponse);

      const data: SendMessageData = {
        conversationUuid: CONVERSATION_UUID,
        content: 'Hello',
        messageType: 'TEXT',
      };
      await messages.send(data);

      expect(http.post).toHaveBeenCalledWith(
        `/api/v1/conversations/${CONVERSATION_UUID}/messages`,
        { content: 'Hello', messageType: 'TEXT' },
      );
    });

    it('returns the 202 accept-shape ({ messageUuid, deliveryStatus }), not a full Message', async () => {
      vi.mocked(http.post).mockResolvedValue(acceptResponse);

      const result = await messages.send({ conversationUuid: CONVERSATION_UUID, content: 'Hello' });

      expect(result.data.messageUuid).toBe('m1');
      expect(result.data.deliveryStatus).toBe('QUEUED');
      // Accept-shape carries only the id + status — no full Message fields.
      expect(result.data).not.toHaveProperty('content');
      expect(result.data).not.toHaveProperty('direction');
    });

    it('NEGATIVE (SDK route compat): never posts the old mismatched /api/v1/messages route', async () => {
      vi.mocked(http.post).mockResolvedValue(acceptResponse);

      await messages.send({ conversationUuid: CONVERSATION_UUID, content: 'Hello' });

      const calledPath = vi.mocked(http.post).mock.calls[0]![0];
      expect(calledPath).toBe(`/api/v1/conversations/${CONVERSATION_UUID}/messages`);
      expect(calledPath).not.toBe('/api/v1/messages');
    });

    it('carries conversationUuid in the PATH, not the body', async () => {
      vi.mocked(http.post).mockResolvedValue(acceptResponse);

      await messages.send({
        conversationUuid: CONVERSATION_UUID,
        content: 'Reply',
        replyToUuid: 'msg-parent',
        attachments: ['media-1'],
        metadata: { key: 'value' },
      });

      const [path, body] = vi.mocked(http.post).mock.calls[0]! as [string, Record<string, unknown>];
      expect(path).toContain(CONVERSATION_UUID);
      expect(body).not.toHaveProperty('conversationUuid');
      expect(body).toEqual({
        content: 'Reply',
        replyToUuid: 'msg-parent',
        attachments: ['media-1'],
        metadata: { key: 'value' },
      });
    });

    it('signature stays stable: existing CRM-shaped payload is accepted unchanged', async () => {
      vi.mocked(http.post).mockResolvedValue(acceptResponse);

      // Mirrors crm/src/extensions/messaging/router.ts sendMessage handler payload.
      await messages.send({
        conversationUuid: CONVERSATION_UUID,
        content: 'Hello',
        messageType: 'TEXT',
        replyToUuid: undefined,
        attachments: undefined,
        metadata: undefined,
      });

      expect(http.post).toHaveBeenCalledWith(
        `/api/v1/conversations/${CONVERSATION_UUID}/messages`,
        expect.objectContaining({ content: 'Hello', messageType: 'TEXT' }),
      );
    });
  });

  // ------------------------------------------------------------------
  // Other methods unchanged (regression guard)
  // ------------------------------------------------------------------

  describe('unchanged routes (backward compatibility)', () => {
    it('list() calls GET /api/v1/conversations/:uuid/messages', async () => {
      vi.mocked(http.get).mockResolvedValue({ data: [], pagination: {}, meta: {} });
      await messages.list(CONVERSATION_UUID, { limit: 20 });
      expect(http.get).toHaveBeenCalledWith(`/api/v1/conversations/${CONVERSATION_UUID}/messages`, { limit: 20 });
    });

    it('get() calls GET /api/v1/messages/:uuid', async () => {
      vi.mocked(http.get).mockResolvedValue({ data: { uuid: 'm1' } });
      await messages.get('m1');
      expect(http.get).toHaveBeenCalledWith('/api/v1/messages/m1');
    });

    it('retry() calls POST /api/v1/messages/:uuid/retry', async () => {
      vi.mocked(http.post).mockResolvedValue({ data: { uuid: 'm1' } });
      await messages.retry('m1');
      expect(http.post).toHaveBeenCalledWith('/api/v1/messages/m1/retry');
    });

    it('delete() calls DELETE /api/v1/messages/:uuid', async () => {
      vi.mocked(http.delete).mockResolvedValue(undefined);
      await messages.delete('m1');
      expect(http.delete).toHaveBeenCalledWith('/api/v1/messages/m1');
    });
  });
});
