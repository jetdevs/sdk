import type { ErrorEntryDef } from '../types';

/**
 * E3200-E3299: messaging delivery and switchboard (msg-api lane).
 * Source: msg-api AppError codes, owner-reply / descriptor validation codes, chat-identity and chat-access clients.
 * Maps to existing (no entry here): NOT_FOUND / send_not_found -> common.not_found; UNAUTHORIZED -> common.unauthorized;
 * FORBIDDEN -> common.forbidden; BAD_REQUEST -> common.invalid_input; CONFLICT -> common.conflict;
 * RATE_LIMITED, CHAT_IDENTITY_LINK_TOKEN_COOLDOWN, CHAT_IDENTITY_LINK_TOKEN_RATE_LIMITED -> common.rate_limited;
 * SERVICE_UNAVAILABLE, CHAT_IDENTITY_FAILED, CHAT_ACCESS_UNAVAILABLE, CHAT_ACCESS_BAD_RESPONSE -> common.unavailable;
 * CHAT_ACCESS_TIMEOUT -> common.timeout; chat PAYMENT_REQUIRED reasons (NO_ACTIVE_SUBSCRIPTION ... SUBSCRIPTION_CANCELED) -> billing.plan_required.
 */
export const MESSAGING = {
  'messaging.conversation_not_active': {
    ref: 'E3201', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This chat isn't open for replies right now.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The conversation is not active for operator sends.', fix: 'Do not retry. Tell the merchant to open the chat in the app and take it over.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['operator_not_active'],
  },
  'messaging.not_conversation_owner': {
    ref: 'E3202', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "Someone else is handling this chat, so you can't reply to it.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The sender does not own the active episode of this chat.', fix: 'Do not retry and do not send another way. Tell the merchant who handles the chat is someone else.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['operator_not_owner'],
  },
  'messaging.target_changed': {
    ref: 'E3203', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'This chat changed since you opened it, so nothing was sent. Reopen it first.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The chat channel or recipient changed after it was read.', fix: 'Do not resend. Read the chat again, check the recipient, then send once.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['target_changed', 'recipient_unavailable'],
  },
  'messaging.connection_unavailable': {
    ref: 'E3204', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: "This messaging line isn't connected right now. Reconnect it to send.",
    forward: ['connect'], resumes: false,
    agent: { reason: 'The messaging connection is missing, changed or not active.', fix: 'Do not retry. Tell the merchant to reconnect the line.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['connection_unavailable'],
  },
  'messaging.recipient_blocked': {
    ref: 'E3205', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This customer can't be messaged.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The customer blocked the business, opted out, or the account was refused.', fix: 'Do not retry and do not message them another way. Skip this customer.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['recipient_blocked', 'ACCOUNT_BLOCKED', 'recipient_identity_refused', 'opted_out'],
  },
  'messaging.window_closed': {
    ref: 'E3206', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'The 24-hour reply window has closed. Send an approved template message instead.',
    forward: ['change'], resumes: false,
    agent: { reason: 'WhatsApp only allows a free-form reply within 24 hours of the customer last writing.', fix: 'Do not retry the same text. Offer an approved template message instead.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['window_closed', 'WINDOW_CLOSED'],
  },
  'messaging.no_platform_conversation': {
    ref: 'E3207', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: 'Send us a message on WhatsApp first so we can reach you there.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The merchant has never messaged the platform line, so it cannot start the chat.', fix: 'Do not retry. Tell the merchant to message the line once first.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['no_platform_conversation'],
  },
  'messaging.identity_link_required': {
    ref: 'E3208', kind: 'needs_merchant', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'Link this chat to your account first, then try again.',
    forward: ['sign_in'], resumes: false,
    agent: { reason: 'This chat is not linked to a merchant account yet.', fix: 'Nothing ran: this chat is not linked to a merchant account yet. The merchant can link it with the link sent to them; the same call gets the same answer until then.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['CHAT_IDENTITY_REQUIRES_EXPLICIT_LINK'],
  },
  'messaging.identity_conflict': {
    ref: 'E3209', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'This chat matches more than one account, so it was not linked.',
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The chat identity points at conflicting account owners.', fix: 'Nothing ran: the chat points at more than one account owner, so no account was picked. Support can sort it out; the merchant can contact them.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['CHAT_IDENTITY_CONFLICT'],
  },
  'messaging.identity_refused': {
    ref: 'E3210', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "We couldn't set up an account from this chat.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'Account creation from this chat was refused.', fix: 'No account was created from this chat, and the same call gets the same answer. Support can help; the merchant can contact them.', ask: null, retry: false },
    owner: 'msg-api', aliases: ['CHAT_IDENTITY_PROVISION_REFUSED'],
  },
  'messaging.internal': {
    ref: 'E3211', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'A msg-api bug or misconfiguration: bad reply card, wrong key, missing config or an inconsistent send claim.', fix: 'Nothing ran because of a fault on our side. The same call gets the same answer until it is fixed. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'msg-api',
    aliases: [
      'idempotency_conflict', 'claim_unavailable', 'CONTACT_IDENTITY_PROJECTION_INVALID',
      'CHAT_IDENTITY_DISABLED', 'CHAT_IDENTITY_NOT_CONFIGURED', 'CHAT_IDENTITY_AUTH_REJECTED',
      'CHAT_ACCESS_NOT_CONFIGURED', 'CHAT_ACCESS_AUTH_REJECTED',
      'CARD_KIND_NOT_ALLOWED', 'UNSUPPORTED_VERSION', 'UNKNOWN_KIND', 'RESERVED_KIND',
      'MISSING_FALLBACK_TEXT', 'KIND_PAYLOAD_MISMATCH', 'INVALID_SHAPE',
    ],
  },
} as const satisfies Record<string, ErrorEntryDef>;
