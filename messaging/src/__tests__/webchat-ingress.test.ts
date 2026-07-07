import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelsResource } from '../webchat/channels-resource.js';
import {
  isWebchatAiRouted,
  isWebchatStartFailure,
  isWebchatDuplicate,
  isWebchatDeliveryPayload,
} from '../webchat/types.js';
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

// Frozen ingress request (webchat-ingress.fixture.json)
const INGRESS_REQ = {
  connectionUuid: '11111111-1111-4111-8111-111111111111',
  message: {
    userUuid: '22222222-2222-4222-8222-222222222222',
    text: 'What are my top campaigns this month?',
    externalId: '33333333-3333-4333-8333-333333333333',
    senderName: 'Merchant User',
  },
  executionContext: '<opaque signed X-Execution-Context envelope>',
};

describe('ChannelsResource.ingress', () => {
  let http: HttpClient;
  let channels: ChannelsResource;

  beforeEach(() => {
    http = createMockHttp();
    channels = new ChannelsResource(http);
  });

  it('POSTs to /api/v1/internal/channels/ingress with the ingress body', async () => {
    (http.post as ReturnType<typeof vi.fn>).mockResolvedValue({
      conversationUuid: '44444444-4444-4444-8444-444444444444',
      executionId: '55555555-5555-4555-8555-555555555555',
    });
    const resp = await channels.ingress(INGRESS_REQ);
    expect(http.post).toHaveBeenCalledWith('/api/v1/internal/channels/ingress', INGRESS_REQ);
    expect(isWebchatAiRouted(resp)).toBe(true);
  });

  it('passes the opaque executionContext through unmodified', async () => {
    (http.post as ReturnType<typeof vi.fn>).mockResolvedValue({ conversationUuid: 'c' });
    await channels.ingress(INGRESS_REQ);
    const [, body] = (http.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(body.executionContext).toBe(INGRESS_REQ.executionContext);
  });
});

describe('ingress sync-response narrowing (4 frozen shapes)', () => {
  const conversationUuid = '44444444-4444-4444-8444-444444444444';

  it('AI-routed → executionId present, no streamUrl', () => {
    const r = { conversationUuid, executionId: '55555555-5555-4555-8555-555555555555' };
    expect(isWebchatAiRouted(r)).toBe(true);
    expect(isWebchatStartFailure(r)).toBe(false);
    expect(isWebchatDuplicate(r)).toBe(false);
    expect('streamUrl' in r).toBe(false);
  });

  it('human-routed → conversationUuid only', () => {
    const r = { conversationUuid };
    expect(isWebchatAiRouted(r)).toBe(false);
    expect(isWebchatStartFailure(r)).toBe(false);
    expect(isWebchatDuplicate(r)).toBe(false);
  });

  it('start-failure → error responder_start_failed', () => {
    const r = { conversationUuid, error: 'responder_start_failed' as const };
    expect(isWebchatStartFailure(r)).toBe(true);
    expect(isWebchatAiRouted(r)).toBe(false);
  });

  it('duplicate → duplicate:true', () => {
    const r = { conversationUuid, duplicate: true as const };
    expect(isWebchatDuplicate(r)).toBe(true);
    expect(isWebchatAiRouted(r)).toBe(false);
  });
});

describe('isWebchatDeliveryPayload — dual-plane guard', () => {
  it('accepts a well-formed turn.delivery payload', () => {
    const payload = {
      eventType: 'turn.delivery',
      channel: 'WEBCHAT',
      connectionUuid: 'c',
      conversationUuid: 'conv',
      messageUuid: 'm',
      idempotencyKey: 'm',
      turn: {
        direction: 'OUTBOUND',
        authorType: 'AI',
        messageType: 'TEXT',
        content: 'hi',
        recipientUserUuid: 'u',
      },
      timestamp: '2023-11-14T22:13:20.000Z',
    };
    expect(isWebchatDeliveryPayload(payload)).toBe(true);
  });

  it.each([
    ['token narration', { eventType: 'text_delta', delta: 'Hel' }],
    ['thinking pill', { eventType: 'execution_progress', currentStep: { label: 'Working' } }],
    ['tool-call card', { eventType: 'tool_call', name: 'emit_card' }],
    ['artifact delta', { eventType: 'artifact_delta', patch: {} }],
    ['status event', { eventType: 'status_update', status: 'running' }],
  ])('rejects telemetry shape: %s', (_label, shape) => {
    expect(isWebchatDeliveryPayload(shape)).toBe(false);
  });

  it('rejects a turn.delivery missing the turn object', () => {
    expect(
      isWebchatDeliveryPayload({ eventType: 'turn.delivery', channel: 'WEBCHAT', messageUuid: 'm', conversationUuid: 'c' }),
    ).toBe(false);
  });
});
