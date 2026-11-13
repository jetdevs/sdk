import type { ErrorEntryDef } from '../types';

/**
 * E3100-E3199: campaign publish and send (yobo campaigns lane).
 * Source: yobo `PublishMessagingErrorCode` (publish-messaging-campaign.ts), R8 publish guard, MCP code table (p99 D11).
 * Maps to existing (no entry here): CAMPAIGN_NOT_FOUND / PLAN_NOT_FOUND -> common.not_found;
 * TARGET_REQUIRED -> common.invalid_input; PUBLISH_REFUSED on PERMISSION_DENIED -> common.forbidden;
 * stale_campaign / stale_ad_campaign -> common.conflict; daily_limit_reached -> common.rate_limited.
 */
export const CAMPAIGN = {
  'campaign.confirmation_required': {
    ref: 'E3101', kind: 'needs_merchant', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'Sending messages to customers needs your OK first.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'Publishing sends real messages and the merchant has not approved it.', fix: 'Nothing was sent: sending needs the merchant\'s approval. Ask them; after a clear yes, call again with confirm true.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['CONFIRMATION_REQUIRED'],
  },
  'campaign.ambiguous': {
    ref: 'E3102', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'That plan has more than one campaign. Pick which one to send.',
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The plan holds several campaigns and none was named.', fix: 'Nothing was sent: more than one campaign matches. The merchant picks which one; then call again with its name.', ask: 'Which campaign should I send?', retry: false },
    owner: 'campaigns', aliases: ['CAMPAIGN_AMBIGUOUS'],
  },
  'campaign.plan_empty': {
    ref: 'E3103', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This plan has no campaigns to send yet. Add one first.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The plan has no proposed campaigns.', fix: 'The same call gets the same answer. Offer to build a campaign in the plan first.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['PLAN_HAS_NO_CAMPAIGNS'],
  },
  'campaign.channel_mismatch': {
    ref: 'E3104', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This campaign's messages are written for a different channel, so nothing was sent.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The messages are written for another channel than the one asked for, or it is an email campaign.', fix: 'The same call gets the same answer. Send it on the channel it was written for, or offer to rewrite it for this channel.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['CHANNEL_MISMATCH', 'NOT_A_NATIVE_CHANNEL'],
  },
  'campaign.channel_not_enabled': {
    ref: 'E3105', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: "This channel isn't set up for your business yet, so nothing was sent.",
    forward: ['connect'], resumes: false,
    agent: { reason: 'The channel is not enabled for this business (for SMS: no approved sender or SMS campaigns off).', fix: 'The same call gets the same answer. Tell the merchant the channel needs setting up; offer another connected channel.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['SMS_NOT_ENABLED', 'CHANNEL_NOT_ENABLED'],
  },
  'campaign.already_published': {
    ref: 'E3106', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'This campaign was already sent, so sending it again would message everyone twice.',
    forward: ['open_app'], resumes: false,
    agent: { reason: 'A messaging workflow already ran for this campaign; sending again would double-message every recipient.', fix: 'The same call gets the same answer. Tell the merchant it is already live or was stopped; re-publishing is done in the app, Campaign Flow tab.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['ALREADY_PUBLISHED'],
  },
  'campaign.not_ready': {
    ref: 'E3107', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: "This campaign isn't finished yet. It needs its messages and audience first.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The campaign has no content, no flow or no audience segment yet.', fix: 'The same call gets the same answer. Tell the merchant what is missing and finish it in the app or with them.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['CAMPAIGN_NOT_READY'],
  },
  'campaign.not_active': {
    ref: 'E3108', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This campaign isn't active, so it can't be sent.",
    forward: ['open_app'], resumes: false,
    agent: { reason: 'The campaign promotions are not active.', fix: 'The same call gets the same answer. Tell the merchant to activate the campaign in the app first.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['PROMOTIONS_INACTIVE'],
  },
  'campaign.no_recipients': {
    ref: 'E3109', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'No customers in this audience can be messaged, so nothing was sent.',
    forward: ['change'], resumes: false,
    agent: { reason: 'Every customer in the audience is unreachable or opted out.', fix: 'The same call gets the same answer. Offer to change the audience.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['NO_REACHABLE_RECIPIENTS'],
  },
  'campaign.offer_unconfirmed': {
    ref: 'E3110', kind: 'needs_merchant', http: 409, trpc: 'CONFLICT',
    fallback: "This message promises an offer you haven't set. Remove that line or add your offer.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The copy promises an offer the merchant never set, or the offer check could not run.', fix: 'Nothing was sent: the campaign has an offer line the merchant did not set. Relay the reason; the merchant can remove the line or add their offer.', ask: 'Remove that line, or add your offer?', retry: false },
    owner: 'campaigns', aliases: ['R8_UNSOURCED_OFFER', 'R8_CHECK_UNAVAILABLE'],
  },
  'campaign.publish_refused': {
    ref: 'E3111', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This campaign can't be sent as it is. Please check it and change it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The publisher refused the campaign for a reason in its detail.', fix: 'The same campaign gets the same answer. The detail says what to change; relay it and offer to fix the campaign.', ask: null, retry: false },
    owner: 'campaigns', aliases: ['PUBLISH_REFUSED'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
