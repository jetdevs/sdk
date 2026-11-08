import type { ErrorEntryDef } from '../types';

/**
 * E3300-E3399: connectors (Shopify, Moka/POS batch API, Buffer, Superhost, the sync engine).
 * Sources: yobo `ShopifyErrorCode`, `BufferErrorCode` + mutation typenames, Superhost `connectorErrorCodeSchema`,
 * the 9 sync failure codes (kb://dab1e235-ee15-4426-af68-6258fe7a4b5b/documents/0cc4ce31-140b-4a66-831e-0d013dc837fc),
 * POS batch errors (p20 yobo-internal-spec §5.5.5).
 * Meanings that already exist elsewhere map to the common code and are not repeated here:
 * THROTTLED / RATE_LIMIT_EXCEEDED / META_RATE_LIMITED → common.rate_limited; POOL_SATURATED, RestProxyError → common.unavailable;
 * NOT_FOUND / NotFoundError / customer_not_found → common.not_found; correction_unauthorized → common.forbidden.
 */
export const CONNECTOR = {
  'connector.credential_invalid': {
    ref: 'E3301', kind: 'needs_merchant', http: 401, trpc: 'UNAUTHORIZED',
    fallback: 'The connection to that account has expired. Reconnect it to go on.',
    forward: ['connect'], resumes: false,
    agent: { reason: 'The connected account rejected our saved login.', fix: 'Do not retry. Tell the merchant the connection needs reconnecting.', ask: null, retry: false },
    owner: 'connectors', aliases: ['credential_invalid', 'INVALID_CREDENTIAL', 'UnauthorizedError'],
  },
  'connector.shop_inactive': {
    ref: 'E3302', kind: 'blocked', http: 403, trpc: 'FORBIDDEN',
    fallback: 'That store is paused or closed, so nothing can be read from it.',
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The store platform reports the shop as inactive.', fix: 'Do not retry. Tell the merchant the store is paused or closed on the platform side.', ask: null, retry: false },
    owner: 'connectors', aliases: ['SHOP_INACTIVE'],
  },
  'connector.limit_reached': {
    ref: 'E3303', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That channel has reached its limit for now. Please change the plan or the time.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The connected service says its own account limit is reached.', fix: 'Do not retry the same post. Offer a different time or channel.', ask: null, retry: false },
    owner: 'connectors', aliases: ['LimitReachedError'],
  },
  'connector.vendor_rejected': {
    ref: 'E3304', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "The other service didn't accept that. Please check it and change it.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The connected service refused the data as invalid.', fix: 'Do not resend the same data. Fix what the detail names, or ask the merchant for it.', ask: null, retry: false },
    owner: 'connectors', aliases: ['USER_ERROR', 'InvalidInputError', 'VoidMutationError'],
  },
  'connector.data_rejected': {
    ref: 'E3305', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "Some records from your store couldn't be read, so they were skipped.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'Records from the connected system did not match the expected shape.', fix: 'Do not retry. Say some records were skipped and the rest went through.', ask: null, retry: false },
    owner: 'connectors', aliases: ['SCHEMA_VALIDATION', 'schema_validation'],
  },
  'connector.duplicate': {
    ref: 'E3306', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That is already there, so nothing new was added.',
    forward: [], resumes: false,
    agent: { reason: 'The record already exists in the connected system.', fix: 'Do not retry. Treat it as already done and move on.', ask: null, retry: false },
    owner: 'connectors', aliases: ['DUPLICATE', 'duplicate', 'customer_conflict', 'offer_conflict', 'reference_conflict', 'tag_conflict'],
  },
  'connector.location_unavailable': {
    ref: 'E3307', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "That location isn't available. Please pick another one.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The outlet is unknown or switched off in the connected system.', fix: 'Do not retry with the same outlet. Let the merchant pick another.', ask: null, retry: false },
    owner: 'connectors', aliases: ['location_unknown', 'location_disabled'],
  },
  'connector.customer_unavailable': {
    ref: 'E3308', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "That customer isn't available. They may have asked to be removed.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The customer or member cannot be used (unavailable or erased on request).', fix: 'Do not retry. Do not try to look them up another way.', ask: null, retry: false },
    owner: 'connectors', aliases: ['customer_unavailable', 'member_unavailable', 'customer_redacted'],
  },
  'connector.offer_unavailable': {
    ref: 'E3309', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "That offer can't be used for this customer. Please pick another.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The offer is gone or the customer is not eligible for it.', fix: 'Do not retry. Offer a different offer.', ask: null, retry: false },
    owner: 'connectors', aliases: ['offer_unavailable', 'offer_ineligible'],
  },
  'connector.tag_limit': {
    ref: 'E3310', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'A customer can have at most 10 tags. Remove one to add another.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The tag count is at its maximum for this customer.', fix: 'Do not retry. Offer to remove a tag first.', ask: null, retry: false },
    owner: 'connectors', aliases: ['tag_limit'],
  },
  'connector.tag_unavailable': {
    ref: 'E3311', kind: 'blocked', http: 404, trpc: 'NOT_FOUND',
    fallback: "That tag isn't available any more. Please pick another.",
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'The tag is unknown, archived or cannot go with the others.', fix: 'Do not retry. List the current tags and let the merchant pick.', ask: null, retry: false },
    owner: 'connectors', aliases: ['tag_unknown', 'tag_archived', 'tag_incompatible'],
  },
  'connector.disconnect_unavailable': {
    ref: 'E3312', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "This connection can't be removed from here right now.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The connected system will not let us disconnect it now.', fix: 'Do not retry. Tell the merchant it cannot be disconnected from here.', ask: null, retry: false },
    owner: 'connectors', aliases: ['disconnect_unavailable'],
  },
  'connector.dependency_missing': {
    ref: 'E3313', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "That depends on a record that hasn't arrived yet, so it was skipped.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'A record points at a customer or item we have not received.', fix: 'Do not retry now. Send the missing record first, then the dependent one.', ask: null, retry: false },
    owner: 'connectors', aliases: ['DEPENDENCY_MISSING'],
  },
  'connector.wrong_phase': {
    ref: 'E3314', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "The import has already finished or hasn't started, so that isn't accepted now.",
    forward: [], resumes: false,
    agent: { reason: 'The bulk import is in a phase that does not accept this call.', fix: 'Do not retry. Use the live endpoint if the import is finished.', ask: null, retry: false },
    owner: 'connectors', aliases: ['BACKFILL_CLOSED', 'BACKFILL_NOT_STARTED', 'BACKFILL_ALREADY_COMPLETE'],
  },
  'connector.not_supported': {
    ref: 'E3315', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "This connection doesn't support that kind of data.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The connector does not handle this data type.', fix: 'Do not retry. Send only data types the connector supports.', ask: null, retry: false },
    owner: 'connectors', aliases: ['ENTITY_NOT_SUPPORTED_BY_CONNECTOR'],
  },
  'connector.batch_too_large': {
    ref: 'E3316', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'That batch has too many items. Please send it in smaller parts.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The batch has more than 500 items.', fix: 'Do not resend as is. Split it into batches of 500 or fewer.', ask: null, retry: false },
    owner: 'connectors', aliases: ['INVALID_BATCH_SIZE'],
  },
  'connector.internal': {
    ref: 'E3399', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'The connector hit an error in our own code or database.', fix: 'Stop. Do not retry. Say only that something went wrong on our side.', ask: null, retry: false },
    owner: 'connectors', aliases: ['DB_LOOKUP_FAILED', 'DB_INSERT_FAILED', 'DB_UPDATE_FAILED', 'GRAPHQL_ERROR', 'UNEXPECTED', 'UnexpectedError', 'UNKNOWN'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
