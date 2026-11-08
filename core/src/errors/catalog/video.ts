import type { ErrorEntryDef } from '../types';

/**
 * E2000–E2099: video generation (yobo + slides `VideoErrorCode` / `VideoFailReason`, p129 contract).
 * Codes that mean a general thing live in `common` / `billing` and carry the video spelling as an alias
 * (credits_short, video_unpriced, timed_out, provider_failed, not_found, forbidden, version_conflict, rate_limited).
 */
export const VIDEO = {
  'video.too_large': {
    ref: 'E2001', kind: 'blocked', http: 413, trpc: 'PAYLOAD_TOO_LARGE',
    fallback: "That video is too big to use. Please pick another one.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The source video is over the size cap.', fix: 'Do not retry and never offer payment for this. Show other choices.', ask: null, retry: false },
    owner: 'video', aliases: ['too_large', '413:too_large'],
  },
  'video.too_long': {
    ref: 'E2002', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'That is too long to make in one go. Please make it shorter.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The requested length is over what the route allows.', fix: 'Do not retry with the same length. Offer a shorter one.', ask: null, retry: false },
    owner: 'video', aliases: ['too_long'],
  },
  'video.unsupported_duration': {
    ref: 'E2003', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "That length isn't available for this video. Please change it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The seconds asked for are not in the routed model’s allowed set.', fix: 'Do not retry with the same seconds. Use an allowed length.', ask: null, retry: false },
    owner: 'video', aliases: ['unsupported_duration', '400:unsupported_duration'],
  },
  'video.content_blocked': {
    ref: 'E2004', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "The video service wouldn't make this one. Please change what it shows.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The provider refused the content.', fix: 'Do not retry the same prompt. Offer to change the scene.', ask: null, retry: false },
    owner: 'video', aliases: ['blocked', 'content_blocked'],
  },
  'video.render_failed': {
    ref: 'E2005', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "That part didn't come out. Please try again.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The render finished with no usable file.', fix: 'Retry once. If it fails again, stop and say so.', ask: null, retry: true },
    owner: 'video', aliases: ['render_failed', 'file_unavailable'],
  },
  'video.not_on_approved_cut': {
    ref: 'E2006', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "That part isn't in the approved version.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The part is not on the approved cut.', fix: 'Do not retry. Work only on parts of the approved cut.', ask: null, retry: false },
    owner: 'video', aliases: ['not_on_approved_cut'],
  },
  'video.storyboard_required': {
    ref: 'E2007', kind: 'needs_merchant', http: 409, trpc: 'PRECONDITION_FAILED',
    fallback: 'The storyboards need your OK before the video can start.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'No approved, reviewed storyboard exists yet.', fix: 'Do not start video. Get the storyboards approved first.', ask: null, retry: false },
    owner: 'remix-storyboard', aliases: ['storyboard_required'],
  },
  'video.unsupported_source': {
    ref: 'E2008', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "I can't use a video from that link. Please pick another ad.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'Links from this platform cannot be fetched.', fix: 'Do not retry. Show other ads to pick from.', ask: null, retry: false },
    owner: 'video', aliases: ['unsupported_source'],
  },
  'video.unsupported': {
    ref: 'E2009', kind: 'blocked', http: 501, trpc: 'NOT_IMPLEMENTED',
    fallback: "That isn't available yet.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The step’s tool is not set up (blank config).', fix: 'Do not retry. Go on without this step.', ask: null, retry: false },
    owner: 'video', aliases: ['unsupported'],
  },
  'video.stopped': {
    ref: 'E2010', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'This was stopped. Tap Try again to start it again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The work was stopped by the merchant or the agent.', fix: 'Start it again only after a new go from the merchant.', ask: null, retry: false },
    owner: 'video', aliases: ['remix_stopped', 'stopped'],
  },
  'video.signature_rejected': {
    ref: 'E2011', kind: 'internal', http: 401, trpc: 'UNAUTHORIZED',
    fallback: "Something went wrong on our side. We've been told and are looking at it.",
    forward: [], resumes: false,
    agent: { reason: 'A service-to-service signature was rejected (bug or clock drift).', fix: 'Stop. Do not retry.', ask: null, retry: false },
    owner: 'video', aliases: ['bad_signature', 'stale_timestamp', 'replayed'],
  },
  'video.dispatch_unknown': {
    ref: 'E2012', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: "Something went wrong on our side. Nothing was charged.",
    forward: [], resumes: false,
    agent: { reason: 'The provider outcome is unknown; the job was failed and credits released.', fix: 'Stop. Do not resubmit.', ask: null, retry: false },
    owner: 'video', aliases: ['dispatch_unknown'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
