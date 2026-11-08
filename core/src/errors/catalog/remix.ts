import type { ErrorEntryDef } from '../types';

/**
 * E2100–E2199: Ad Studio Remix (p131/p132) refusal causes. Replaces yobo `START_REFUSAL_KINDS`
 * (`src/extensions/remix/advance/refusal-kind.ts`) and the free `<step>:<reason>` cause strings.
 * Kinds keep the refusal-kind table's choices (retryable / blocked) so buttons do not change, except
 * credits, which moves to `billing.credits_short` (needs_merchant + top_up).
 */
export const REMIX = {
  'remix.ad_unreadable': {
    ref: 'E2101', kind: 'retryable', http: 503, trpc: 'SERVICE_UNAVAILABLE',
    fallback: "I couldn't check this ad right now. Tap Try again.",
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The ad or its route could not be read just now.', fix: 'Retry once on a new go.', ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['template_unreadable', 'route_unreadable'],
  },
  'remix.ad_not_read': {
    ref: 'E2102', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'The ad has not been read yet. Try again in a minute.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The ad reading has not finished.', fix: 'Wait for the reading, then retry once.', ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['not_read'],
  },
  'remix.no_product': {
    ref: 'E2103', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'Send one photo of the product first, then tap Try again.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The remix has no product photo.', fix: 'Get the product photo (catalog or merchant), then retry once.', ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['no_product', 'no_photo'],
  },
  'remix.not_set_up': {
    ref: 'E2104', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'This remix is still being set up. Try again in a minute.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The remix project row does not exist yet.', fix: 'Wait, then retry once.', ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['no_project'],
  },
  'remix.sheet_not_ready': {
    ref: 'E2105', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'The product picture is not ready yet. Tap Try again.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The product sheet is not done, failed, or its start was refused.', fix: 'Retry the sheet once; never use the raw photo instead.', ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['no_sheet', 'sheet_failed', 'sheet_refused'],
  },
  'remix.not_template': {
    ref: 'E2106', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "This ad can't be remixed. Please pick a ready ad.",
    forward: ['pick_other', 'change'], resumes: false,
    agent: { reason: 'The ad is not a remixable template or has no assessment.', fix: 'Do not retry. Show ready ads to pick from.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['not_template', 'no_assessment'],
  },
  'remix.route_blocked': {
    ref: 'E2107', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "This ad can't be made with your product. Please pick a ready ad.",
    forward: ['pick_other', 'change'], resumes: false,
    agent: { reason: 'The route refuses this ad or this kind of swap.', fix: 'Do not retry. Show ready ads to pick from.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['route_refuse', 'route_not_swap', 'source_refused'],
  },
  'remix.no_source_copy': {
    ref: 'E2108', kind: 'blocked', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: "I don't have a copy of this ad. Please pick a ready ad.",
    forward: ['pick_other', 'change'], resumes: false,
    agent: { reason: 'No stored copy of the source video exists.', fix: 'Do not retry. Show ready ads to pick from.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['no_source_copy'],
  },
  'remix.storyboard_drift': {
    ref: 'E2109', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "The storyboards drifted from your ad. Please change them before going on.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The storyboard review found drift from the plan.', fix: 'Do not retry. Offer to change the storyboards.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['drift_blocked'],
  },
  'remix.fix_not_applicable': {
    ref: 'E2110', kind: 'blocked', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: "That change can't be made to this part.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The fix target is not a part, or there is no open press ask.', fix: 'Do not retry. Ask what to change.', ask: null, retry: false },
    owner: 'remix-generation', aliases: ['not_a_part', 'no_press_ask'],
  },
  'remix.step_refused': {
    ref: 'E2111', kind: 'blocked', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: "That step can't go on as it is. Please change something.",
    forward: ['change', 'pick_other'], resumes: false,
    agent: { reason: 'A step check refused to go on.', fix: 'Do not retry. Ask what to change.', ask: null, retry: false },
    owner: 'remix-generation', aliases: ['refused'],
  },
  'remix.step_failed': {
    ref: 'E2112', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: "That step didn't work on your remix. We've been told and are looking at it.",
    forward: [], resumes: false,
    agent: { reason: 'A remix job died, threw, or its record was lost (a bug or provider crash).', fix: 'Do not retry. Tell the merchant we are looking at it.', ask: null, retry: false },
    owner: 'remix-generation',
    aliases: ['job_failed', 'job_dead', 'start_threw', 'start_failed', 'enqueue_failed', 'record_lost', 'failed', 'threw', 'not_consumed'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
