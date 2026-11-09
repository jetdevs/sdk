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
    owner: 'remix-storyboard', aliases: ['template_unreadable', 'route_unreadable', 'route_missing'],
  },
  'remix.ad_not_read': {
    ref: 'E2102', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'The ad has not been read yet. Try again in a minute.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The ad reading has not finished.', fix: "Do not retry now; retry once when the tool reports it ready or on the merchant's next message.", ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['not_read', 'no_blueprint'],
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
    agent: { reason: 'The remix project row does not exist yet.', fix: "Do not retry now; retry once when the tool reports it ready or on the merchant's next message.", ask: null, retry: true },
    owner: 'remix-storyboard', aliases: ['no_project', 'brief:missing'],
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
    owner: 'remix-storyboard', aliases: ['no_source_copy', 'no_source_frame'],
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
    owner: 'remix-generation', aliases: ['refused', 'same_plan', 'go_no_step', 'no_step_start', 'no_part', 'no_part_named', 'not_in_plan', 'storyboard_check_not_passed'],
  },
  'remix.step_failed': {
    ref: 'E2112', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: "That step didn't work on your remix. Something went wrong on our side.",
    forward: [], resumes: false,
    agent: { reason: 'A remix job died, threw, or its record was lost (a bug or provider crash).', fix: 'Do not retry. Say only that something went wrong on our side.', ask: null, retry: false },
    owner: 'remix-generation',
    aliases: ['job_failed', 'job_dead', 'start_threw', 'start_failed', 'enqueue_failed', 'record_lost', 'failed', 'threw', 'not_consumed', 'inputs_failed', 'video_unshown', 'qa_hold_video_unshown', 'storyboard_check_failed', 'drift_ask_not_posted'],
  },
  'remix.parts_running': {
    ref: 'E2113', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'Some parts are still being made. Tap Try again when they are ready.',
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'Other video parts of this remix are still rendering.', fix: "Do not retry now; retry once when the tool reports it ready or on the merchant's next message.", ask: null, retry: true },
    owner: 'remix-generation', aliases: ['parts_still_running'],
  },
  'remix.product_review_failed': {
    ref: 'E2114', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "The product picture still doesn't match your product. Please send another photo or pick a ready ad.",
    forward: ['change', 'pick_other'], resumes: false,
    agent: { reason: 'The product picture failed its review a second time.', fix: 'Do not remake it again. Ask for another product photo or offer a ready ad.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['product_review_failed_again'],
  },
  // yobo dev 186 (lead-24): [Keep it] on a parked remix left a part that never started; its fresh [Try again] starts it.
  // Not parts_running (that hint says "still rendering", a false line here) and not our fault (no team alert).
  'remix.part_not_started': {
    ref: 'E2115', kind: 'retryable', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: "This part of your video hasn't started yet. Tap Try again to start it.",
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: "A video part of this remix has not started yet; nothing is rendering for it.", fix: 'Tell the merchant the part has not started and that [Try again] starts it. Do not start it yourself.', ask: null, retry: true },
    owner: 'remix-generation', aliases: ['part_not_started'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
