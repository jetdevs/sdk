import type { ErrorEntryDef } from '../types';

/**
 * E3600-E3699: ads (Meta pull, overlay render, safe image fetch).
 * Sources: yobo `AdsPullErrorCode` (extensions/ads/review/graph.ts), `OverlayErrorCode`, `SafeFetchErrorCode`.
 * Maps to existing (not repeated): META_RATE_LIMITED → common.rate_limited; INVALID_CREDENTIAL → connector.credential_invalid;
 * safe-fetch `timeout` → common.timeout; QUEUE_ERROR / ENQUEUE_FAILED / JEV_UNAVAILABLE → common.unavailable; RUN_TIMEOUT → common.timeout.
 */
export const ADS = {
  'ads.pull_failed': {
    ref: 'E3601', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't read your Meta ads just now. Please try again.",
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The Meta ads pull failed for a reason that is not a login or rate limit.', fix: 'Retry once. If it fails again, stop and say so.', ask: null, retry: true },
    owner: 'ads', aliases: ['META_PULL_FAILED'],
  },
  'ads.font_unsupported': {
    ref: 'E3602', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "The ad text has a character we can't draw. Please change the wording.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The ad copy has a character outside the bundled fonts.', fix: 'Do not retry the same copy. Offer wording without that character.', ask: null, retry: false },
    owner: 'ads', aliases: ['font_coverage'],
  },
  'ads.text_no_fit': {
    ref: 'E3603', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "That text is too long to fit on the ad. Please shorten it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The copy does not fit the empty zone at a readable size.', fix: 'Do not retry the same copy. Offer shorter text.', ask: null, retry: false },
    owner: 'ads', aliases: ['no_fit'],
  },
  'ads.image_link_invalid': {
    ref: 'E3604', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "That image link can't be used. Please try another.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The image link is malformed, not secure, private, unresolvable or loops.', fix: 'Do not retry the same link. Ask for another image or upload.', ask: null, retry: false },
    owner: 'ads', aliases: ['invalid_url', 'not_https', 'private_address', 'dns_failed', 'too_many_redirects'],
  },
  'ads.image_unreachable': {
    ref: 'E3605', kind: 'retryable', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't download that image. Please try again or use another.",
    forward: ['try_again', 'change'], resumes: false,
    agent: { reason: 'The image host answered with an error or the download broke.', fix: 'Retry once. If it fails again, ask for another image.', ask: null, retry: true },
    owner: 'ads', aliases: ['http_status', 'transport'],
  },
  'ads.image_not_usable': {
    ref: 'E3606', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "That file isn't a usable image, or it's too small. Please pick another.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The file is not an image or is below the minimum size.', fix: 'Do not retry. Ask for a larger image.', ask: null, retry: false },
    owner: 'ads', aliases: ['not_an_image', 'too_small'],
  },
  'ads.image_too_large': {
    ref: 'E3607', kind: 'blocked', http: 413, trpc: 'PAYLOAD_TOO_LARGE',
    fallback: 'That image is too big to use. Please pick a smaller one.',
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The image file is over the size cap.', fix: 'Do not retry. Ask for a smaller image.', ask: null, retry: false },
    owner: 'ads',
  },
  'ads.internal': {
    ref: 'E3699', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'The ads job hit an error in our own code or setup (fonts, taxonomy, worker).', fix: 'Stop. Do not retry. Say only that something went wrong on our side.', ask: null, retry: false },
    owner: 'ads', aliases: ['fonts_missing', 'WORKER_ERROR', 'TAXONOMY_INVALID'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
