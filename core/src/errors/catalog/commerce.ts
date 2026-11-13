import type { ErrorEntryDef } from '../types';

/**
 * E3400-E3499: commerce engine, checkout, orders and refunds (commerce lane).
 * Source: commerce src/lib/errors.ts + services, payments/xendit/errors.ts, payments/types.ts, commerce-app EngineError.
 * Maps to existing (no entry here): unauthorized -> common.unauthorized; forbidden -> common.forbidden; not_found -> common.not_found;
 * rate_limited -> common.rate_limited; version_conflict, outlet_changed -> common.conflict; checkout_disabled, engine_unreachable -> common.unavailable;
 * method_not_allowed and plain input codes (invalid_body, invalid_polygon, invalid_limit, invalid_phone, invalid_amount, invalid_actor, invalid_stage_id,
 * invalid_slot_key, invalid_card_id, invalid_error, invalid_idem_key, invalid_due_rule, unsupported_due_rule, invalid_handler_type, unknown_lane,
 * unknown_line, missing_rows, missing_customer_ref, empty_batch, claim_code_mismatch, not_a_bundle, invalid_bundle_slot,
 * category_max_depth, category_parent_tree_mismatch) -> common.invalid_input.
 * Not errors: Xendit DUPLICATE_ERROR / IDEMPOTENCY_ERROR (409 is the success path, section 3).
 */
export const COMMERCE = {
  'commerce.out_of_stock': {
    ref: 'E3401', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That item is out of stock.',
    forward: ['pick_other'], resumes: false,
    agent: { reason: 'Not enough stock to reserve this item.', fix: 'Do not retry. Tell the customer it is out of stock and offer another item.', ask: null, retry: false },
    owner: 'commerce', aliases: ['out_of_stock'],
  },
  'commerce.stock_below_zero': {
    ref: 'E3402', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "That stock change would take the count below zero. Please check the number.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The adjustment would drive on-hand stock below zero.', fix: 'Do not resend. Fix the quantity or ask the merchant for the right number.', ask: null, retry: false },
    owner: 'commerce', aliases: ['insufficient_stock'],
  },
  'commerce.empty_cart': {
    ref: 'E3403', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: 'The cart is empty. Add an item first.',
    forward: ['change'], resumes: false,
    agent: { reason: 'There is no cart or it has no items.', fix: 'Do not retry. Add an item to the cart first.', ask: null, retry: false },
    owner: 'commerce', aliases: ['empty_cart'],
  },
  'commerce.promo_unusable': {
    ref: 'E3404', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "That promo code can't be used on this order.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The promo code is used up, not started, over its cap, wrong currency or fails its rules.', fix: 'Do not retry the same code. Tell the customer it cannot be used and carry on without it.', ask: null, retry: false },
    owner: 'commerce', aliases: ['invalid_discount', 'used_by_customer', 'at_cap', 'usage_limit_reached', 'not_started', 'currency_mismatch', 'rules_failed'],
  },
  'commerce.outlet_closed': {
    ref: 'E3405', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "The store is closed right now, so this order can't be placed.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The outlet is closed.', fix: 'Do not retry. Tell the customer the store is closed and offer another outlet or time.', ask: null, retry: false },
    owner: 'commerce', aliases: ['outlet_closed'],
  },
  'commerce.out_of_zone': {
    ref: 'E3406', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "That address is outside this store's delivery area.",
    forward: ['change', 'pick_other'], resumes: false,
    agent: { reason: 'The delivery pin is outside the outlet zone.', fix: 'Do not retry. Offer pickup, another address or another outlet.', ask: null, retry: false },
    owner: 'commerce', aliases: ['outlet_out_of_zone'],
  },
  'commerce.below_min_order': {
    ref: 'E3407', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'This order is below the minimum for this store. Add more items.',
    forward: ['change'], resumes: false,
    agent: { reason: 'The cart total is under the outlet minimum order.', fix: 'Do not retry. Tell the customer to add items to reach the minimum.', ask: null, retry: false },
    owner: 'commerce', aliases: ['below_min_order'],
  },
  'commerce.checkout_expired': {
    ref: 'E3408', kind: 'retryable', http: 409, trpc: 'CONFLICT',
    fallback: 'This checkout has expired. Please start it again.',
    forward: ['try_again'], resumes: false,
    agent: { reason: 'The checkout session is no longer payable.', fix: 'Get a fresh quote, show it, then check out once more.', ask: null, retry: true },
    owner: 'commerce', aliases: ['checkout_expired'],
  },
  'commerce.payments_not_configured': {
    ref: 'E3409', kind: 'needs_merchant', http: 400, trpc: 'BAD_REQUEST',
    fallback: "Payments aren't set up for this store yet.",
    forward: ['connect'], resumes: false,
    agent: { reason: 'The store has no active payment provider or its onboarding is incomplete.', fix: 'Do not retry. Tell the merchant to finish payment setup.', ask: null, retry: false },
    owner: 'commerce', aliases: ['payments_not_configured'],
  },
  'commerce.not_refundable': {
    ref: 'E3410', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "This order has no payment to refund.",
    forward: [], resumes: false,
    agent: { reason: 'The order has no captured payment to refund.', fix: 'Do not retry. Tell the merchant there is nothing to refund.', ask: null, retry: false },
    owner: 'commerce', aliases: ['not_refundable'],
  },
  'commerce.refund_exceeds_remaining': {
    ref: 'E3411', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "That refund is more than what's left to refund on this order.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The refund amount is above the remaining refundable amount.', fix: 'Do not resend. Ask for a smaller amount.', ask: null, retry: false },
    owner: 'commerce', aliases: ['refund_exceeds_remaining', 'MAXIMUM_REFUND_AMOUNT_REACHED'],
  },
  'commerce.refund_unsupported': {
    ref: 'E3412', kind: 'blocked', http: 422, trpc: 'UNPROCESSABLE_CONTENT',
    fallback: "This payment type can't be refunded automatically. It has to be refunded by hand.",
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The payment rail cannot refund (virtual account, partial refund, or past the refund window).', fix: 'Do not retry. Tell the merchant it must be refunded by hand.', ask: null, retry: false },
    owner: 'commerce', aliases: ['REFUND_UNSUPPORTED', 'REFUND_NOT_SUPPORTED', 'PARTIAL_REFUND_NOT_SUPPORTED', 'INELIGIBLE_TRANSACTION'],
  },
  'commerce.refund_failed': {
    ref: 'E3413', kind: 'blocked', http: 502, trpc: 'BAD_GATEWAY',
    fallback: 'The payment provider refused this refund.',
    forward: ['contact_support'], resumes: false,
    agent: { reason: 'The payment provider refused the refund.', fix: 'Do not retry. Tell the merchant the provider refused it.', ask: null, retry: false },
    owner: 'commerce', aliases: ['refund_failed'],
  },
  'commerce.refund_in_progress': {
    ref: 'E3414', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'A refund for this payment is already on its way.',
    forward: [], resumes: false,
    agent: { reason: 'A refund for this payment is already running.', fix: 'Do not start another. Tell the merchant it is already in progress.', ask: null, retry: false },
    owner: 'commerce', aliases: ['REFUND_IN_PROGRESS'],
  },
  'commerce.provider_balance_low': {
    ref: 'E3415', kind: 'needs_merchant', http: 402, trpc: 'PAYMENT_REQUIRED',
    fallback: "Your payment provider balance is too low to pay this refund. Add funds to it.",
    forward: ['open_app'], resumes: false,
    agent: { reason: "The merchant's payment provider balance is too low to fund the refund.", fix: 'Do not retry now. Tell the merchant to add funds to their provider balance.', ask: null, retry: false },
    owner: 'commerce', aliases: ['PROVIDER_INSUFFICIENT_BALANCE', 'INSUFFICIENT_BALANCE'],
  },
  'commerce.invalid_state': {
    ref: 'E3416', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: "That can't be done in its current state.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The order, version or QC step is in a state that does not allow this change.', fix: 'Do not retry. Read the current state and tell the merchant what is allowed.', ask: null, retry: false },
    owner: 'commerce', aliases: ['invalid_state', 'transition_rejected', 'invalid_qc_transition', 'version_not_editable', 'version_not_approved'],
  },
  'commerce.name_taken': {
    ref: 'E3417', kind: 'blocked', http: 409, trpc: 'CONFLICT',
    fallback: 'That handle or SKU is already in use. Pick a different one.',
    forward: ['change'], resumes: false,
    agent: { reason: 'A product handle or SKU already exists.', fix: 'Do not resend. Choose a different value.', ask: null, retry: false },
    owner: 'commerce', aliases: ['handle_taken', 'sku_taken'],
  },
  'commerce.invalid_selection': {
    ref: 'E3418', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "Those options don't fit this item. Please pick again.",
    forward: ['change'], resumes: false,
    agent: { reason: 'The chosen modifiers or bundle slots are not valid for this item.', fix: 'Do not resend. Show the valid options and let the customer pick again.', ask: null, retry: false },
    owner: 'commerce', aliases: ['invalid_modifier_group', 'invalid_modifier_selection', 'unknown_modifier_option', 'invalid_bundle_selection'],
  },
  'commerce.money_in_copy': {
    ref: 'E3419', kind: 'blocked', http: 400, trpc: 'BAD_REQUEST',
    fallback: "Prices can't go in this text. Take the amount out.",
    forward: ['change'], resumes: false,
    agent: { reason: 'Store copy contains a money amount, which must come from the price list.', fix: 'Do not resend. Remove the amount from the text.', ask: null, retry: false },
    owner: 'commerce', aliases: ['money_in_copy'],
  },
  'commerce.internal': {
    ref: 'E3420', kind: 'internal', http: 500, trpc: 'INTERNAL_SERVER_ERROR',
    fallback: 'Something went wrong on our side.',
    forward: [], resumes: false,
    agent: { reason: 'A commerce engine bug or misconfiguration (engine guard missed, shopper link failed, media or engine not configured).', fix: 'Nothing ran because of a fault on our side. The same call gets the same answer until it is fixed. Tell the merchant it is on our side and offer what else you can do now.', ask: null, retry: false },
    owner: 'commerce',
    aliases: ['customer_link_failed', 'checkout_create_failed', 'media_not_configured', 'engine_not_configured', 'TRANSACTION_NOT_FOUND', 'API_VALIDATION_ERROR', 'XENDIT_API_ERROR'],
  },
} as const satisfies Record<string, ErrorEntryDef>;
