import type { ErrorEntryDef } from '../types';

/** E1200–E1299: credits, plans, payment. */
export const BILLING = {
  'billing.credits_short': {
    ref: 'E1201', kind: 'needs_merchant', http: 402, trpc: 'PAYMENT_REQUIRED',
    fallback: 'There are not enough credits for this yet. It starts by itself as soon as credits are added.',
    forward: ['top_up'], resumes: true,
    agent: {
      reason: 'The account has fewer credits than this step costs.',
      fix: 'Do not retry. The work resumes by itself once credits are added; start nothing else for it.',
      ask: null, retry: false,
    },
    owner: 'billing',
    aliases: ['402:credits_short', 'credits_short', 'PLATFORM_CREDITS_EXHAUSTED', 'NO_CREDITS', 'INSUFFICIENT_CREDITS', 'insufficient_credits', 'no_credits'],
  },
  'billing.plan_required': {
    ref: 'E1202', kind: 'needs_merchant', http: 402, trpc: 'PAYMENT_REQUIRED',
    fallback: 'This needs a paid plan. Upgrade to use it.',
    forward: ['upgrade'], resumes: false,
    agent: { reason: "The org's plan does not include this feature.", fix: 'Do not retry. Tell the merchant once that it needs an upgrade; never offer it again in the same chat.', ask: null, retry: false },
    owner: 'billing', aliases: ['PLAN_REQUIRED', 'payment_required', 'plan_gate'],
  },
  'billing.access_unavailable': {
    ref: 'E1203', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "This isn't available on your account.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The feature is not available to this account at any plan.', fix: 'Do not retry and do not offer payment. Tell the merchant it is not available.', ask: null, retry: false },
    owner: 'billing', aliases: ['ACCESS_UNAVAILABLE', 'access_unavailable', 'org_not_enabled'],
  },
  'billing.own_key_required': {
    ref: 'E1204', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: 'This needs your own provider key. Add it in settings to go on.',
    forward: ['connect'], resumes: false,
    agent: { reason: 'The run needs the org’s own provider key and none is set.', fix: 'Do not retry. Tell the merchant to add the key in settings.', ask: null, retry: false },
    owner: 'billing', aliases: ['OWN_PROVIDER_KEY_REQUIRED'],
  },
  'billing.unpriced': {
    ref: 'E1205', kind: 'blocked', http: 402, trpc: 'PAYMENT_REQUIRED',
    fallback: "This can't be priced right now, so it can't start.",
    forward: ['change', 'pick_other'], resumes: false,
    agent: { reason: 'No price exists for this route or model.', fix: 'Do not retry. Offer to change the choice or pick another.', ask: null, retry: false },
    owner: 'billing', aliases: ['402:video_unpriced', 'video_unpriced', 'PLATFORM_MODEL_UNAVAILABLE'],
  },
  'billing.price_changed': {
    ref: 'E1206', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'The price changed. Please check it and try again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The quote is stale or the price changed since it was shown.', fix: 'Get a fresh quote, show it, then retry once.', ask: null, retry: true },
    owner: 'billing', aliases: ['price_changed', 'quote_stale'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
