import type { ErrorEntryDef } from '../types';

/** E1100–E1199: sign-in and org context. */
export const AUTH = {
  'auth.session_expired': {
    ref: 'E1101', kind: 'needs_merchant', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'Your sign-in has expired. Please sign in again.',
    forward: ['sign_in'], resumes: false,
    agent: { reason: 'The session expired.', fix: 'The sign-in ended, so nothing ran. The same call gets the same answer until the merchant signs in again; that is their next step.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['SESSION_EXPIRED', 'TOKEN_EXPIRED'],
  },
  'auth.org_required': {
    ref: 'E1102', kind: 'needs_merchant', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'Please pick a business first.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'No business (org) is selected for this action.', fix: 'No business is selected, so nothing ran. The merchant can pick a business in the app; then the same call works.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['ORG_REQUIRED', 'no_org', 'org_required'],
  },
  'auth.service_key_rejected': {
    // dev proof 2026-11-08: a rejected API / service key comes from a MACHINE caller (Cadra, an API client), never a
    // signed-out merchant — telling the merchant to sign in again was wrong (internal routes 401, REST INVALID_API_KEY)
    ref: 'E1103', kind: 'internal', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'A service or API key was rejected (our setup, not the merchant).', fix: 'Nothing ran: our own key was rejected. The same call gets the same answer until we fix it; the merchant needs no sign-in. Tell them it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'core-auth', aliases: ['INVALID_API_KEY', 'EXPIRED_API_KEY', 'REVOKED_API_KEY', 'service_key_rejected'],
  },
  'auth.chat_entry_browser_refused': {
    // YMS-1924: an in-app browser (iOS WKWebView seen) drops the Secure sign-in cookie, NextAuth refuses the chat-entry
    // sign-in and next-auth's signIn still reports ok; the entry page now checks the session and says this instead.
    ref: 'E1104', kind: 'needs_merchant', http: 403, trpc: 'FORBIDDEN',
    fallback: "This browser didn't let us sign you in. Open the link in your phone's browser, or ask the chat for a new link.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The chat sign-in link was refused inside an in-app browser: its sign-in cookie was blocked.', fix: 'Nobody was signed in. The same link works when opened in the phone browser, and a new link from the chat works too.', ask: null, retry: false },
    owner: 'yobo-auth', aliases: ['chat_entry_browser_refused'],
  },
  'auth.login_code_not_on_whatsapp': {
    // YMS-1927: WhatsApp answers 131008 (recipient has no WhatsApp account) to the sign-in code send.
    ref: 'E1105', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "This number isn't on WhatsApp. Use another number.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The phone number has no WhatsApp account (WhatsApp error 131008).', fix: 'No code was sent. The same number gets the same answer; a number that is on WhatsApp works.', ask: null, retry: false },
    owner: 'yobo-auth', aliases: ['login_code_not_on_whatsapp'],
  },
  'auth.login_code_send_failed': {
    // YMS-1927: the sign-in code send failed for a reason that is ours or the provider's, after one silent retry.
    ref: 'E1106', kind: 'internal', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't send your sign-in code. It's on our side, and we're on it.",
    forward: [], resumes: false,
    agent: { reason: 'The WhatsApp sign-in code could not be sent (our side or the provider), after one retry.', fix: 'No code was sent and the merchant cannot fix it. Tell them it is on our side.', ask: null, retry: false },
    owner: 'yobo-auth', aliases: ['login_code_send_failed'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
