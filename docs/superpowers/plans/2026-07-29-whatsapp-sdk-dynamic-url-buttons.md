# WhatsApp SDK Dynamic URL Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in runtime URL button parameters to `@jetdevs/cloud/whatsapp` so onboarding reminder Utility templates can send per-recipient CTA URL values through the existing SDK path.

**Architecture:** Keep the current SDK architecture: `WhatsAppClient` calls credentials-service endpoints, not Meta Cloud API directly. Add optional `buttonParameters` to template-message sending and map them into the existing credentials-service `components` array. Preserve all existing production call shapes and behavior unless the caller explicitly passes the new optional field.

**Tech Stack:** TypeScript, `@jetdevs/cloud/whatsapp`, Vitest, Node `fetch` mocking, tsup build.

## Global Constraints

- Do not change existing public method names or positional behavior.
- Do not make any existing optional field required.
- Do not rename or remove `templateId`; existing production callers use it and it must continue to populate `provider_template_id`.
- Do not change `sendTemplateMessage` behavior when `buttonParameters` is omitted.
- Do not change `sendCarouselMessage` behavior in this SDK change.
- Do not change media upload behavior or header media payload shape.
- Do not add direct Meta HTTP calls in SDK or merchant; SDK continues to call credentials-service.
- Body variables and button variables must be separate WhatsApp `components`.
- Runtime resume token or full resume URL must not be logged.
- Replace raw request-payload debug logs before or in the same task that adds `buttonParameters`.
- Preserve existing quick reply support through the current `buttons` field.
- Existing Marketing/campaign template calls must remain compatible.
- Existing body-parameter templates must continue to work.
- Provider routing remains explicit through current `wabaId` and `senderLabel`; do not add `provider` to SDK unless a dedicated routing task maps it safely.
- Verification commands for this repo are `pnpm --filter @jetdevs/cloud test`, `pnpm --filter @jetdevs/cloud build`, and `pnpm --filter @jetdevs/cloud lint`.

---

## File Structure

- Modify `cloud/src/whatsapp/types.ts`
  - Add `WhatsAppTemplateButtonParameter`.
  - Add optional `buttonParameters` to `SendTemplateMessageRequest`.
  - Keep `templateId`, `buttons`, `imageUrl`, `media`, `bodyParameters`, and WABA fields unchanged.

- Modify `cloud/src/whatsapp/client.ts`
  - Add a focused runtime button-parameter builder.
  - Keep existing `buildButtonComponents()` behavior for legacy quick replies.
  - Compose `components` as: optional header, body, legacy quick replies from `buttons`, new runtime buttons from `buttonParameters`.
  - Replace raw request payload logging with safe counts/flags.

- Create `cloud/src/whatsapp/client.test.ts`
  - Mock token fetch and credentials-service send calls via `global.fetch`.
  - Test new dynamic URL button payload.
  - Test existing production payloads remain unchanged when `buttonParameters` is absent.
  - Test log redaction.
  - Test invalid button parameter validation.

- Modify `cloud/README.md`
  - Document the new optional `buttonParameters` field with a credentials-service-shaped example.
  - Explicitly state that `templateId` remains the send identifier.

---

### Task 1: Lock Current Production Behavior With Regression Tests

**Files:**
- Create: `cloud/src/whatsapp/client.test.ts`

**Interfaces:**
- Consumes: existing `WhatsAppClient.sendTemplateMessage(params: SendTemplateMessageRequest): Promise<SendMessageResponse>`.
- Produces: regression tests proving omitted `buttonParameters` keeps existing payload shape.

- [ ] **Step 1: Write the credentials-service fetch mock**

Create `cloud/src/whatsapp/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppClient } from './client';
import { resetWhatsAppTokenCache } from './token-cache';

const tokenResponse = {
  success: true,
  data: {
    apiUrl: 'https://whatsapp.test',
    accessToken: 'access-token',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  },
};

const sendResponse = {
  ProviderMessageID: 'wamid.test',
  Status: 'SENT',
};

function installFetchMock() {
  const calls: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, init, body });

    if (url === 'https://credentials.test/api/credentials/whatsapp/token') {
      return new Response(JSON.stringify(tokenResponse), { status: 200 });
    }

    if (url === 'https://whatsapp.test/api/v1/whatsapp/send/template') {
      return new Response(JSON.stringify(sendResponse), { status: 200 });
    }

    return new Response(JSON.stringify({ error: `unexpected url ${url}` }), { status: 500 });
  }));

  return calls;
}

function sendCall(calls: Array<{ url: string; body?: unknown }>) {
  const call = calls.find((entry) => entry.url.endsWith('/api/v1/whatsapp/send/template'));
  if (!call) {
    throw new Error('send call was not captured');
  }
  return call;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  resetWhatsAppTokenCache();
  process.env.YOBO_SDK_CREDENTIALS_API_URL = 'https://credentials.test';
  process.env.YOBO_SDK_API_KEY = 'sdk-key';
  process.env.YOBO_DEBUG = 'false';
});
```

- [ ] **Step 2: Add baseline text-template regression test**

Add below the helpers:

```ts
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

    expect(sendCall(calls).body).toEqual({
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
});
```

- [ ] **Step 3: Add baseline media and quick-reply regression test**

Add inside the same `describe`:

```ts
it('keeps existing media and quick-reply payload shape when buttonParameters is omitted', async () => {
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

  expect(sendCall(calls).body).toEqual({
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
```

- [ ] **Step 4: Run tests to verify the baseline passes**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: PASS. These are characterization tests for current production behavior.

- [ ] **Step 5: Commit**

```bash
git add cloud/src/whatsapp/client.test.ts
git commit -m "test: lock whatsapp template send payload shape"
```

---

### Task 2: Add SDK Contract And Runtime Button Mapping

**Files:**
- Modify: `cloud/src/whatsapp/types.ts`
- Modify: `cloud/src/whatsapp/client.ts`
- Test: `cloud/src/whatsapp/client.test.ts`

**Interfaces:**
- Consumes: `SendTemplateMessageRequest.templateId`.
- Produces:

```ts
export type WhatsAppTemplateButtonParameter =
  | { type: 'url'; index: number; text: string }
  | { type: 'quick_reply'; index: number; payload: string };

export interface SendTemplateMessageRequest extends WabaConfig {
  buttonParameters?: WhatsAppTemplateButtonParameter[];
}
```

- [ ] **Step 1: Write the failing dynamic URL test**

Add inside `describe('WhatsAppClient.sendTemplateMessage', ...)`:

```ts
it('sends runtime URL button parameters in separate button components', async () => {
  const calls = installFetchMock();
  const client = new WhatsAppClient();

  await client.sendTemplateMessage({
    templateId: 'onboarding_phase1_initial',
    phoneNumber: '+14155550123',
    bodyParameters: ['Ada', 'Ada Bakery'],
    buttonParameters: [
      { type: 'url', index: 0, text: 'resume-token-abc' },
    ],
    wabaId: 'waba-123',
    senderLabel: 'META_DEFAULT',
  });

  const body = sendCall(calls).body as {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: FAIL because `buttonParameters` is not typed or mapped yet.

- [ ] **Step 3: Add public types**

In `cloud/src/whatsapp/types.ts`, add before `SendTemplateMessageRequest`:

```ts
/**
 * Runtime button parameters for approved WhatsApp templates.
 * URL parameters fill dynamic URL suffix placeholders such as {{1}}.
 * Quick reply parameters preserve explicit payload support without changing
 * the existing generated-payload behavior of `buttons`.
 */
export type WhatsAppTemplateButtonParameter =
  | {
      type: 'url';
      index: number;
      text: string;
    }
  | {
      type: 'quick_reply';
      index: number;
      payload: string;
    };
```

Then add this optional field to `SendTemplateMessageRequest`:

```ts
  /**
   * Runtime button parameters. Omit this field to preserve legacy production
   * behavior. Use URL parameters for dynamic CTA URL template placeholders.
   */
  buttonParameters?: WhatsAppTemplateButtonParameter[];
```

- [ ] **Step 4: Add validation and component builder**

In `cloud/src/whatsapp/client.ts`, import the new type:

```ts
  WhatsAppTemplateButtonParameter,
```

Add these helpers above `export class WhatsAppClient`:

```ts
type RuntimeButtonComponent =
  | {
      type: 'button';
      sub_type: 'url';
      index: number;
      parameters: [{ type: 'text'; text: string }];
    }
  | {
      type: 'button';
      sub_type: 'quick_reply';
      index: number;
      parameters: [{ type: 'payload'; payload: string }];
    };

function validateButtonParameter(parameter: WhatsAppTemplateButtonParameter): void {
  if (!Number.isInteger(parameter.index) || parameter.index < 0) {
    throw new Error('WhatsApp button parameter index must be a non-negative integer');
  }

  if (parameter.type === 'url') {
    if (!parameter.text || /[\r\n\t]/.test(parameter.text)) {
      throw new Error('WhatsApp URL button parameter must be a non-empty single-line string');
    }
    return;
  }

  if (!parameter.payload || /[\r\n\t]/.test(parameter.payload)) {
    throw new Error('WhatsApp quick reply button payload must be a non-empty single-line string');
  }
}

function buildRuntimeButtonComponents(
  buttonParameters?: WhatsAppTemplateButtonParameter[]
): RuntimeButtonComponent[] {
  if (!buttonParameters || buttonParameters.length === 0) {
    return [];
  }

  return buttonParameters.map((parameter) => {
    validateButtonParameter(parameter);

    if (parameter.type === 'url') {
      return {
        type: 'button',
        sub_type: 'url',
        index: parameter.index,
        parameters: [{ type: 'text', text: parameter.text }],
      };
    }

    return {
      type: 'button',
      sub_type: 'quick_reply',
      index: parameter.index,
      parameters: [{ type: 'payload', payload: parameter.payload }],
    };
  });
}
```

- [ ] **Step 5: Use the new builder without touching legacy behavior**

In `sendTemplateMessage`, change the destructuring to include `buttonParameters`:

```ts
const {
  templateId,
  phoneNumber,
  metadata,
  bodyParameters,
  wabaId,
  senderLabel,
  mediaType,
  buttons,
  buttonParameters,
  documentFilename,
} = params;
```

After the existing legacy line:

```ts
const buttonComponents = this.buildButtonComponents(buttons);
```

add:

```ts
const runtimeButtonComponents = buildRuntimeButtonComponents(buttonParameters);
```

Then append runtime components after legacy quick reply components:

```ts
...buttonComponents,
...runtimeButtonComponents,
```

- [ ] **Step 6: Run focused test**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: PASS. Existing regression tests and new dynamic URL test pass.

- [ ] **Step 7: Commit**

```bash
git add cloud/src/whatsapp/types.ts cloud/src/whatsapp/client.ts cloud/src/whatsapp/client.test.ts
git commit -m "feat: send whatsapp runtime button parameters"
```

---

### Task 3: Redact Template Send Logs In The Same SDK Path

**Files:**
- Modify: `cloud/src/whatsapp/client.ts`
- Test: `cloud/src/whatsapp/client.test.ts`

**Interfaces:**
- Consumes: `buttonParameters?: WhatsAppTemplateButtonParameter[]`.
- Produces: logs containing counts and flags only; no phone number, body parameter values, or button parameter values.

- [ ] **Step 1: Write the failing log-redaction test**

Add inside the same `describe`:

```ts
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
    buttonParameters: [
      { type: 'url', index: 0, text: 'resume-token-abc' },
    ],
    wabaId: 'waba-123',
  });

  expect(sendCall(calls).body).toBeTruthy();
  const logs = [...debugSpy.mock.calls, ...infoSpy.mock.calls].flat().join('\n');
  expect(logs).not.toContain('+14155550123');
  expect(logs).not.toContain('Ada Bakery');
  expect(logs).not.toContain('resume-token-abc');
  expect(logs).toContain('bodyParameterCount');
  expect(logs).toContain('buttonParameterCount');

  debugSpy.mockRestore();
  infoSpy.mockRestore();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: FAIL because current debug logs include `phoneNumber` and raw `requestBody`.

- [ ] **Step 3: Replace raw send debug logs**

In `sendTemplateMessage`, replace the current debug call with:

```ts
log.debug('Sending template message', {
  templateId,
  hasPhoneNumber: !!phoneNumber,
  hasMedia: !!media,
  mediaMode: media ? (isUrl ? 'link' : 'id') : 'none',
  mediaType: effectiveMediaType,
  bodyParameterCount: bodyParameters?.length || 0,
  legacyButtonCount: buttons?.length || 0,
  buttonParameterCount: buttonParameters?.length || 0,
  documentFilename: isDocument ? documentFilename : undefined,
  hasWabaId: !!wabaId,
  senderLabel,
});
```

Replace:

```ts
log.debug('Template message request payload', { requestBody: JSON.stringify(requestBody) });
```

with:

```ts
log.debug('Template message request prepared', {
  templateId,
  componentCount: requestBody.components.length,
  hasHeaderComponent: !!media,
  bodyParameterCount: bodyParameters?.length || 0,
  legacyButtonComponentCount: buttonComponents.length,
  runtimeButtonComponentCount: runtimeButtonComponents.length,
  hasWabaId: !!wabaId,
  senderLabel: requestBody.sender_label,
});
```

- [ ] **Step 4: Leave non-send logs untouched**

Do not alter media upload logging or template creation logging in this task. This task is scoped to runtime send secrets. Template creation uses template definitions, not per-recipient resume tokens.

- [ ] **Step 5: Run focused tests**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cloud/src/whatsapp/client.ts cloud/src/whatsapp/client.test.ts
git commit -m "fix: redact whatsapp template send logs"
```

---

### Task 4: Validate Runtime Button Parameters Without Rejecting Existing Calls

**Files:**
- Modify: `cloud/src/whatsapp/client.test.ts`

**Interfaces:**
- Consumes: validation from `buildRuntimeButtonComponents`.
- Produces: tests proving validation only applies when `buttonParameters` is present.

- [ ] **Step 1: Add invalid URL parameter tests**

Add inside `describe`:

```ts
it('rejects invalid runtime URL button parameter indexes', async () => {
  installFetchMock();
  const client = new WhatsAppClient();

  await expect(client.sendTemplateMessage({
    templateId: 'onboarding_phase1_initial',
    phoneNumber: '+14155550123',
    buttonParameters: [
      { type: 'url', index: -1, text: 'resume-token-abc' },
    ],
  })).rejects.toThrow('WhatsApp button parameter index must be a non-negative integer');
});

it('rejects multiline runtime URL button parameter values', async () => {
  installFetchMock();
  const client = new WhatsAppClient();

  await expect(client.sendTemplateMessage({
    templateId: 'onboarding_phase1_initial',
    phoneNumber: '+14155550123',
    buttonParameters: [
      { type: 'url', index: 0, text: 'resume-token\nabc' },
    ],
  })).rejects.toThrow('WhatsApp URL button parameter must be a non-empty single-line string');
});
```

- [ ] **Step 2: Add compatibility test for legacy empty body/empty buttons**

Add inside `describe`:

```ts
it('does not require buttonParameters for existing production sends', async () => {
  const calls = installFetchMock();
  const client = new WhatsAppClient();

  await client.sendTemplateMessage({
    templateId: 'legacy_template',
    phoneNumber: '6281234567890',
  });

  expect(sendCall(calls).body).toEqual({
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
```

- [ ] **Step 3: Run focused tests**

Run:

```bash
pnpm --filter @jetdevs/cloud test -- client.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add cloud/src/whatsapp/client.test.ts
git commit -m "test: cover whatsapp button parameter validation"
```

---

### Task 5: Document The Additive SDK API

**Files:**
- Modify: `cloud/README.md`

**Interfaces:**
- Consumes: `buttonParameters?: WhatsAppTemplateButtonParameter[]`.
- Produces: public integration guidance that does not encourage direct Meta fallback or `templateId` renaming.

- [ ] **Step 1: Add API reference text**

In `cloud/README.md`, add a WhatsApp dynamic URL button section near the WhatsApp usage area:

````md
### WhatsApp Runtime URL Button Parameters

`sendTemplateMessage` supports optional `buttonParameters` for approved
templates that contain dynamic URL buttons, for example a template button URL
ending in `?token={{1}}`.

Existing callers do not need to change. When `buttonParameters` is omitted, the
SDK sends the same body/header/quick-reply payload shape as before.

```ts
await whatsapp.sendTemplateMessage({
  templateId: 'onboarding_phase1_initial',
  phoneNumber: '+14155550123',
  bodyParameters: ['Ada', 'Ada Bakery'],
  buttonParameters: [
    { type: 'url', index: 0, text: 'resume-token-abc' },
  ],
  wabaId: 'waba-123',
  senderLabel: 'META_DEFAULT',
});
```

The SDK sends the runtime value in a separate button component:

```json
{
  "type": "button",
  "sub_type": "url",
  "index": 0,
  "parameters": [{ "type": "text", "text": "resume-token-abc" }]
}
```

Do not put per-recipient URL tokens in `bodyParameters`, `metadata`, template
definitions, or logs.
````

- [ ] **Step 2: Run build**

Run:

```bash
pnpm --filter @jetdevs/cloud build
```

Expected: PASS and generated `cloud/dist/whatsapp/index.d.ts` includes `buttonParameters`.

- [ ] **Step 3: Commit**

```bash
git add cloud/README.md cloud/dist/whatsapp/index.d.ts cloud/dist/whatsapp/index.d.mts cloud/dist/whatsapp/index.js cloud/dist/whatsapp/index.mjs
git commit -m "docs: document whatsapp dynamic url button parameters"
```

---

### Task 6: Full SDK Verification And Release Handoff

**Files:**
- Modify only if release process requires it: `cloud/package.json`, `cloud/README.md`, generated `cloud/dist/*`.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified SDK branch ready for PR/release, with merchant handoff notes.

- [ ] **Step 1: Run cloud package verification**

Run:

```bash
pnpm --filter @jetdevs/cloud test
pnpm --filter @jetdevs/cloud build
pnpm --filter @jetdevs/cloud lint
```

Expected: PASS.

- [ ] **Step 2: Check git diff for accidental broad changes**

Run:

```bash
git diff --stat develop...HEAD
git diff -- cloud/src/whatsapp/types.ts cloud/src/whatsapp/client.ts cloud/src/whatsapp/client.test.ts cloud/README.md
```

Expected: diff is limited to SDK WhatsApp types/client/tests/docs and generated dist if build artifacts are committed in this repo.

- [ ] **Step 3: Prepare merchant handoff note**

Use this exact handoff text in the PR description:

```md
SDK package: @jetdevs/cloud
Feature branch: feat/whatsapp-dynamic-url-buttons

New additive API:

await whatsapp.sendTemplateMessage({
  templateId: 'onboarding_phase1_initial',
  phoneNumber: '+14155550123',
  bodyParameters: ['Ada', 'Ada Bakery'],
  buttonParameters: [{ type: 'url', index: 0, text: rawResumeToken }],
  wabaId,
  senderLabel,
});

Compatibility:
- Existing sendTemplateMessage callers are unchanged.
- Existing sendCarouselMessage callers are unchanged.
- Existing createTemplate callers are unchanged.
- Runtime button tokens are not logged by SDK send logs.

Merchant integration requirement:
- Map stored provider to senderLabel in merchant compat/service layer if needed.
- Do not pass rawResumeToken in bodyParameters, metadata, delivery snapshots, or logs.
```

- [ ] **Step 4: Commit release metadata only if changed**

If package version or dist files changed:

```bash
git add cloud/package.json cloud/README.md cloud/dist
git commit -m "chore: prepare cloud whatsapp dynamic url release"
```

If no release metadata changed, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan supports Utility dynamic URL buttons via the existing SDK path, separates body/button variables, avoids direct Meta fallback, keeps existing prod calls compatible, and adds log redaction for runtime tokens.
- Placeholder scan: No task uses vague placeholder instructions; each test and implementation step includes concrete code or command.
- Type consistency: The plan uses `buttonParameters`, `WhatsAppTemplateButtonParameter`, `templateId`, `wabaId`, and `senderLabel` consistently. It intentionally does not introduce SDK-level `provider` because current SDK routing uses `senderLabel`.
- Compatibility check: Existing `sendTemplateMessage` behavior is characterized before implementation, `buttonParameters` is optional, `sendCarouselMessage` is out of scope, and `createTemplate` is not changed.
