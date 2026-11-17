import type { ErrorEntryDef } from '../types';

/**
 * E3600-E3699: ads (Meta pull, overlay render, safe image fetch).
 * Sources: yobo `AdsPullErrorCode` (extensions/ads/review/graph.ts), `OverlayErrorCode`, `SafeFetchErrorCode`.
 * Maps to existing (not repeated): META_RATE_LIMITED → common.rate_limited; INVALID_CREDENTIAL → connector.credential_invalid;
 * safe-fetch `timeout` → common.timeout; QUEUE_ERROR / ENQUEUE_FAILED / JEV_UNAVAILABLE → common.unavailable; RUN_TIMEOUT → common.timeout.
 */
export const ADS = {
  'ads.pull_failed': {
    // P6 (lead-12): our side — the system retries once silently; this is what is left when that also failed
    ref: 'E3601', kind: 'internal', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't read your Meta ads. Something went wrong on our side.",
    forward: [], resumes: false,
    agent: { reason: 'The Meta ads pull failed twice for a reason that is not a login or rate limit.', fix: 'The system already tried again once; The same call gets the same answer. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'ads', aliases: ['META_PULL_FAILED'],
  },
  'ads.font_unsupported': {
    // P6 (lead-12): the system falls back to a supported font with no merchant line; seen only if that fallback failed
    ref: 'E3602', kind: 'internal', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'The ad copy has a character outside the bundled fonts and the font fallback failed.', fix: 'The same call gets the same answer. The merchant needs no font detail. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'ads', aliases: ['font_coverage'],
  },
  'ads.text_no_fit': {
    // P6 (lead-12) + P0 (agents-lead-5): the system shrinks / wraps once; if it still does not fit, the agent uses ONE
    // shorter line that keeps the meaning, applies it, and offers Change — it never asks first
    ref: 'E3603', kind: 'needs_merchant', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: 'That line was too long for the ad, so I used a shorter one. Tap Change to edit it.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The copy still does not fit the empty zone after one shrink and wrap.', fix: 'The same text does not fit. One shorter line that keeps the meaning does; apply it and offer Change.', ask: null, retry: false },
    owner: 'ads', aliases: ['no_fit'],
  },
  'ads.image_link_invalid': {
    ref: 'E3604', kind: 'needs_merchant', http: 400, trpc: 'BAD_REQUEST',
    fallback: "That image link can't be used. Please send another image.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The image link is malformed, not secure, private, unresolvable or loops.', fix: 'The same link gets the same answer. Another image link or an upload works; ask once.', ask: null, retry: false },
    owner: 'ads', aliases: ['invalid_url', 'not_https', 'private_address', 'dns_failed', 'too_many_redirects'],
  },
  'ads.image_unreachable': {
    ref: 'E3605', kind: 'needs_merchant', http: 502, trpc: 'BAD_GATEWAY',
    fallback: "We couldn't download that image. Please send another one.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The image host answered with an error or the download broke.', fix: 'The same link gets the same answer. Another image link or an upload works; ask once.', ask: null, retry: false },
    owner: 'ads', aliases: ['http_status', 'transport'],
  },
  'ads.image_not_usable': {
    ref: 'E3606', kind: 'needs_merchant', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "That file isn't a usable image, or it's too small. Please send another one.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The file is not an image or is below the minimum size.', fix: 'The same call gets the same answer. Say why in one line and ask once for another image.', ask: null, retry: false },
    owner: 'ads', aliases: ['not_an_image', 'too_small'],
  },
  'ads.image_too_large': {
    // P6 (lead-12): the system resizes large images silently; seen only if that resize failed
    ref: 'E3607', kind: 'internal', http: 413, trpc: 'PAYLOAD_TOO_LARGE',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'The image file is over the size cap and the resize failed.', fix: 'The same call gets the same answer. The merchant needs no size detail. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'ads',
  },
  'ads.internal': {
    ref: 'E3699', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'The ads job hit an error in our own code or setup (fonts, taxonomy, worker).', fix: 'Nothing ran because of a fault on our side. The same call gets the same answer until it is fixed. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'ads', aliases: ['fonts_missing', 'WORKER_ERROR', 'TAXONOMY_INVALID'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
