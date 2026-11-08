import type { ErrorEntryDef } from '../types';

/**
 * E3500-E3599: onboarding (create org, access code, plan finalize, business analysis, WhatsApp create-business).
 * Sources: yobo `CreateOrgErrorCode`, `FinalizePlanErrorCode`, `BusinessAnalyzerErrorCode`, `AccessErrorKey`,
 * p84 refusals (kb://dab1e235-ee15-4426-af68-6258fe7a4b5b/documents/94a4fabe-d78b-4908-9566-aa36d33e70e2).
 * Maps to existing (not repeated): CONFLICT (create org) → common.conflict, ORG_NOT_FOUND → common.not_found,
 * rateLimited / p84 rate_limited → common.rate_limited, p84 identity_unavailable → agent.identity_unavailable.
 */
export const ONBOARDING = {
  'onboarding.analysis_missing': {
    ref: 'E3501', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "We lost your business details. Please start again from the first step.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'Create-org ran with no saved business analysis.', fix: 'Do not retry. Send the merchant back to the first step.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['ANALYSIS_MISSING'],
  },
  'onboarding.access_code_required': {
    ref: 'E3502', kind: 'needs_merchant', http: 403, trpc: 'FORBIDDEN',
    fallback: 'You need an access code to create a workspace. Enter yours to go on.',
    forward: ['change'], resumes: false,
    agent: { reason: 'Sign-up needs an access code and none was given.', fix: 'Do not retry. Ask the merchant to enter their access code.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['accessCodeRequired', 'code_required', 'ACCESS_REFUSED'],
  },
  'onboarding.access_code_invalid': {
    ref: 'E3503', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: "That access code doesn't work. Please check it and try another.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The access code is not accepted (wrong, expired or not for this email).', fix: 'Do not retry the same code. Ask for another; never say which codes exist.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['accessCodeInvalid'],
  },
  'onboarding.access_code_used_up': {
    ref: 'E3504', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: 'That access code has been used up.',
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The access code has no uses left.', fix: 'Do not retry. Tell the merchant to ask for a new code.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['accessCodeExhausted'],
  },
  'onboarding.access_check_unavailable': {
    ref: 'E3505', kind: 'retryable', http: 503, trpc: 'SERVICE_UNAVAILABLE',
    fallback: "We can't check access codes right now. Please try again in a minute.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The sign-up access check is down.', fix: 'Retry once. If it fails again, tell the merchant to try later.', ask: null, retry: true },
    owner: 'onboarding', aliases: ['accessUnavailable'],
  },
  'onboarding.sign_in_setup_failed': {
    ref: 'E3506', kind: 'retryable', http: 503, trpc: 'SERVICE_UNAVAILABLE',
    fallback: "We couldn't finish setting up sign-in for your workspace. Please try again.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The workspace exists but its sign-in setup failed for a passing reason.', fix: 'Retry once; the call is safe to repeat. If it fails again, stop.', ask: null, retry: true },
    owner: 'onboarding', aliases: ['CONNECT_PROVISION_FAILED'],
  },
  'onboarding.plan_missing': {
    ref: 'E3507', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "Your plan isn't ready yet. Please open the app to finish it.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'Finishing onboarding found no saved campaign plan.', fix: 'Do not retry. Send the merchant to the plan step.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['PLAN_MISSING'],
  },
  'onboarding.no_campaign_type': {
    ref: 'E3508', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'Your plan has no campaign type yet. Please choose one.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The saved plan names no campaign type.', fix: 'Do not retry. Ask the merchant to pick a campaign type.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['NO_CAMPAIGN_TYPE'],
  },
  'onboarding.source_link_invalid': {
    ref: 'E3509', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "We don't recognise that link. Please check it and try another.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The business link is not a supported source.', fix: 'Do not retry the same link. Ask for a website, Instagram or store link.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['INVALID_URL'],
  },
  'onboarding.source_unreadable': {
    ref: 'E3510', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't read that page just now. Please try again or use another link.",
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'Fetching the business page failed.', fix: 'Retry once. If it fails again, ask for a different link.', ask: null, retry: true },
    owner: 'onboarding', aliases: ['SCRAPE_FAILED'],
  },
  'onboarding.analysis_failed': {
    ref: 'E3511', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't finish reading your business. Please try again.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The business analysis did not finish (start, run, timeout or unreadable result).', fix: 'Retry once. If it fails again, stop and say so.', ask: null, retry: true },
    owner: 'onboarding', aliases: ['CADRA_DISPATCH_FAILED', 'CADRA_TIMEOUT', 'CADRA_FAILED', 'PARSE_FAILED'],
  },
  'onboarding.name_required': {
    ref: 'E3512', kind: 'needs_merchant', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'What should the new business be called?',
    forward: ['change'], resumes: false,
    agent: { reason: 'Create-business was called with no name.', fix: 'Do not retry. Ask the merchant for the business name.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['name_required'],
  },
  'onboarding.confirmation_expired': {
    ref: 'E3513', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That confirmation has run out. Please start the new business again.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The create-business confirmation is missing or too old.', fix: 'Do not retry the old confirmation. Start the create flow again.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['confirmation_expired', 'confirmation_not_found'],
  },
  'onboarding.internal': {
    ref: 'E3599', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'Onboarding hit an error in our own code (org row, login token or role setup).', fix: 'Stop. Do not retry. Say only that something went wrong on our side.', ask: null, retry: false },
    owner: 'onboarding', aliases: ['ROLE_TEMPLATE_FAILED', 'INTERNAL'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
