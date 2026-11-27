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
} as const satisfies Record<string, ErrorEntryDef>;
