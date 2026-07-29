import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSdkConfig } from '../config/credentials';
import { WhatsAppClient } from './client';
import { resetWhatsAppTokenCache } from './token-cache';

const sendResponse = {
  ProviderMessageID: 'wamid.test',
  Status: 'SENT',
};

const createTemplateResponse = {
  ProviderTemplateID: 'template-provider-id',
  Status: 'APPROVED',
};

type CapturedFetchCall = {
  url: string;
  init?: RequestInit;
  body?: unknown;
};

function tokenResponse() {
  return {
    success: true,
    data: {
      apiUrl: 'https://whatsapp.test',
      accessToken: 'access-token',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  };
}

function installFetchMock() {
  const calls: CapturedFetchCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url.toString();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url: requestUrl, init, body });

      if (requestUrl === 'https://credentials.test/api/credentials/whatsapp/token') {
        return new Response(JSON.stringify(tokenResponse()), { status: 200 });
      }

      if (requestUrl === 'https://whatsapp.test/api/v1/whatsapp/send/template') {
        return new Response(JSON.stringify(sendResponse), { status: 200 });
      }

      if (requestUrl === 'https://whatsapp.test/api/v1/whatsapp/templates') {
        return new Response(JSON.stringify(createTemplateResponse), { status: 200 });
      }

      return new Response(JSON.stringify({ error: `unexpected url ${requestUrl}` }), {
        status: 500,
      });
    })
  );

  return calls;
}

function capturedCall(calls: CapturedFetchCall[], path: string) {
  const call = calls.find((entry) => entry.url.endsWith(path));
  if (!call) {
    throw new Error(`${path} call was not captured`);
  }
  return call;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  resetSdkConfig();
  resetWhatsAppTokenCache();
  process.env.YOBO_SDK_CREDENTIALS_API_URL = 'https://credentials.test';
  process.env.YOBO_SDK_API_KEY = 'sdk-key';
  process.env.YOBO_DEBUG = 'false';
});

describe('WhatsAppClient.createTemplate', () => {
  it('passes Utility URL button template components through to credentials-service', async () => {
    const calls = installFetchMock();
    const client = new WhatsAppClient();

    await client.createTemplate({
      name: 'onboarding_phase1_initial',
      language: 'en_US',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, your setup is saved.',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Continue setup',
              url: 'https://merchant.yobolabs.ai/signup/resume?token={{1}}',
            },
          ],
        },
      ],
      wabaId: 'waba-123',
      senderLabel: 'META_DEFAULT',
    });

    expect(capturedCall(calls, '/api/v1/whatsapp/templates').body).toEqual({
      name: 'onboarding_phase1_initial',
      language: 'en_US',
      category: 'UTILITY',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, your setup is saved.',
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Continue setup',
              url: 'https://merchant.yobolabs.ai/signup/resume?token={{1}}',
            },
          ],
        },
      ],
      sender_label: 'META_DEFAULT',
      waba_id: 'waba-123',
    });
  });
});

describe('WhatsAppClient.sendTemplateMessage', () => {
  it('keeps existing body-only template payload unchanged', async () => {
    const calls = installFetchMock();
    const client = new WhatsAppClient();

    await client.sendTemplateMessage({
      templateId: 'campaign_template',
      phoneNumber: '6281234567890',
      bodyParameters: ['Ada', 'Ada Bakery'],
      metadata: { campaignId: 'campaign-1' },
      wabaId: 'waba-123',
      senderLabel: 'META_DEFAULT',
    });

    expect(capturedCall(calls, '/api/v1/whatsapp/send/template').body).toEqual({
      provider_template_id: 'campaign_template',
      recipient_phone_number: '6281234567890',
      metadata: { campaignId: 'campaign-1' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Ada' },
            { type: 'text', text: 'Ada Bakery' },
          ],
        },
      ],
      sender_label: 'META_DEFAULT',
      waba_id: 'waba-123',
    });
  });

  it('keeps existing media and quick-reply payload shape when runtime button parameters are omitted', async () => {
    const calls = installFetchMock();
    const client = new WhatsAppClient();
    const randomUUIDSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('payload-uuid');

    await client.sendTemplateMessage({
      templateId: 'image_template',
      phoneNumber: '6281234567890',
      imageUrl: 'https://cdn.test/image.jpg',
      bodyParameters: ['Ada'],
      buttons: [
        { type: 'url', text: 'Shop', url: 'https://merchant.test', order: 0 },
        { type: 'quickReply', text: 'Opt Out', order: 1 },
      ],
    });

    expect(capturedCall(calls, '/api/v1/whatsapp/send/template').body).toEqual({
      provider_template_id: 'image_template',
      recipient_phone_number: '6281234567890',
      metadata: {},
      components: [
        {
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: { link: 'https://cdn.test/image.jpg' },
            },
          ],
        },
        {
          type: 'body',
          parameters: [{ type: 'text', text: 'Ada' }],
        },
        {
          type: 'button',
          sub_type: 'quick_reply',
          index: 1,
          parameters: [{ type: 'payload', payload: 'payload-uuid' }],
        },
      ],
      sender_label: 'META_DEFAULT',
    });

    randomUUIDSpy.mockRestore();
  });

  it('sends runtime URL button parameters in separate button components', async () => {
    const calls = installFetchMock();
    const client = new WhatsAppClient();

    await client.sendTemplateMessage({
      templateId: 'onboarding_phase1_initial',
      phoneNumber: '+14155550123',
      bodyParameters: ['Ada', 'Ada Bakery'],
      buttonParameters: [{ type: 'url', index: 0, text: 'resume-token-abc' }],
      wabaId: 'waba-123',
      senderLabel: 'META_DEFAULT',
    });

    const body = capturedCall(calls, '/api/v1/whatsapp/send/template').body as {
      components: Array<Record<string, unknown>>;
    };

    expect(body.components).toEqual([
      {
        type: 'body',
        parameters: [
          { type: 'text', text: 'Ada' },
          { type: 'text', text: 'Ada Bakery' },
        ],
      },
      {
        type: 'button',
        sub_type: 'url',
        index: 0,
        parameters: [{ type: 'text', text: 'resume-token-abc' }],
      },
    ]);
    expect(JSON.stringify(body.components[0])).not.toContain('resume-token-abc');
    expect(JSON.stringify(body.components[1])).toContain('resume-token-abc');
  });

  it('does not log phone numbers, body parameters, or runtime button parameter values', async () => {
    process.env.YOBO_DEBUG = 'true';
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const calls = installFetchMock();
    const client = new WhatsAppClient();

    await client.sendTemplateMessage({
      templateId: 'onboarding_phase1_initial',
      phoneNumber: '+14155550123',
      bodyParameters: ['Ada', 'Ada Bakery'],
      buttonParameters: [{ type: 'url', index: 0, text: 'resume-token-abc' }],
      wabaId: 'waba-123',
    });

    expect(capturedCall(calls, '/api/v1/whatsapp/send/template').body).toBeTruthy();
    const logs = [...debugSpy.mock.calls, ...infoSpy.mock.calls].flat().join('\n');
    expect(logs).not.toContain('+14155550123');
    expect(logs).not.toContain('Ada Bakery');
    expect(logs).not.toContain('resume-token-abc');
    expect(logs).toContain('bodyParameterCount');
    expect(logs).toContain('buttonParameterCount');

    debugSpy.mockRestore();
    infoSpy.mockRestore();
  });

  it('rejects invalid runtime URL button parameter indexes', async () => {
    installFetchMock();
    const client = new WhatsAppClient();

    await expect(
      client.sendTemplateMessage({
        templateId: 'onboarding_phase1_initial',
        phoneNumber: '+14155550123',
        buttonParameters: [{ type: 'url', index: -1, text: 'resume-token-abc' }],
      })
    ).rejects.toThrow('WhatsApp button parameter index must be a non-negative integer');
  });

  it('rejects multiline runtime URL button parameter values', async () => {
    installFetchMock();
    const client = new WhatsAppClient();

    await expect(
      client.sendTemplateMessage({
        templateId: 'onboarding_phase1_initial',
        phoneNumber: '+14155550123',
        buttonParameters: [{ type: 'url', index: 0, text: 'resume-token\nabc' }],
      })
    ).rejects.toThrow('WhatsApp URL button parameter must be a non-empty single-line string');
  });

  it('does not require runtime button parameters for existing production sends', async () => {
    const calls = installFetchMock();
    const client = new WhatsAppClient();

    await client.sendTemplateMessage({
      templateId: 'legacy_template',
      phoneNumber: '6281234567890',
    });

    expect(capturedCall(calls, '/api/v1/whatsapp/send/template').body).toEqual({
      provider_template_id: 'legacy_template',
      recipient_phone_number: '6281234567890',
      metadata: {},
      components: [
        {
          type: 'body',
          parameters: [],
        },
      ],
      sender_label: 'META_DEFAULT',
    });
  });
});
