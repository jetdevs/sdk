import { describe, expect, it } from 'vitest';
import {
  CatalogError,
  catalogError,
  forwardFor,
  fromUnknown,
  isCatalogError,
  lookup,
  merchantLine,
  merchantText,
  raise,
  readCatalogError,
  toHttpBody,
  toOutcome,
  toToolResult,
} from '../index';

describe('lookup — every legacy spelling resolves to one entry', () => {
  it.each([
    ['billing.credits_short', 'billing.credits_short'],
    ['E1201', 'billing.credits_short'],
    ['402:credits_short', 'billing.credits_short'],
    ['part:credits_short', 'billing.credits_short'], // yobo dev run 3dc16981
    ['start:402:credits_short', 'billing.credits_short'],
    ['sheet:credits_short', 'billing.credits_short'],
    ['NO_CREDITS', 'billing.credits_short'],
    ['PLATFORM_CREDITS_EXHAUSTED', 'billing.credits_short'],
    ['402:video_unpriced', 'billing.unpriced'],
    ['storyboard:video_unpriced', 'billing.unpriced'],
    ['409:version_conflict', 'common.conflict'],
    ['start:no_sheet', 'remix.sheet_not_ready'],
    ['sheet:no_photo', 'remix.no_product'],
    ['brief:no_project', 'remix.not_set_up'],
    ['storyboard:drift_blocked', 'remix.storyboard_drift'],
    ['fix:not_a_part', 'remix.fix_not_applicable'],
    ['join:job_dead:3dc16981-0000-4000-8000-000000000000', 'remix.step_failed'],
    ['job:3dc16981-0000-4000-8000-000000000000:timed_out', 'common.timeout'],
    ['400:invalid_request', 'common.invalid_input'],
    ['NOT_FOUND', 'common.not_found'],
  ])('%s → %s', (input, code) => {
    expect(lookup(input)?.code).toBe(code);
  });

  it('unknown spellings resolve to nothing', () => {
    expect(lookup('totally_new_reason')).toBeUndefined();
    expect(lookup('')).toBeUndefined();
    expect(lookup(42)).toBeUndefined();
  });
});

describe('raise / catalogError / isCatalogError', () => {
  it('raise throws a branded CatalogError with the entry', () => {
    let caught: unknown;
    try {
      raise('billing.credits_short', { params: { needed: 120 }, detail: 'reserve' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CatalogError);
    expect(isCatalogError(caught)).toBe(true);
    const err = caught as CatalogError;
    expect(err.ref).toBe('E1201');
    expect(err.kind).toBe('needs_merchant');
    expect(err.params).toEqual({ needed: 120 });
  });

  it('isCatalogError is false for plain errors', () => {
    expect(isCatalogError(new Error('x'))).toBe(false);
    expect(isCatalogError(null)).toBe(false);
  });
});

describe('fromUnknown', () => {
  it('passes a CatalogError through', () => {
    const e = catalogError('remix.route_blocked');
    expect(fromUnknown(e)).toBe(e);
  });

  it('maps a TRPCError-like value by its code', () => {
    expect(fromUnknown({ name: 'TRPCError', code: 'NOT_FOUND', message: 'Video not found' }).code).toBe('common.not_found');
    expect(fromUnknown({ name: 'TRPCError', code: 'PAYMENT_REQUIRED', message: 'x' }).code).toBe('billing.credits_short');
  });

  it('maps a result-style {status, code}', () => {
    expect(fromUnknown({ ok: false, status: 402, code: 'credits_short' }).code).toBe('billing.credits_short');
  });

  it('maps a REST / tool envelope', () => {
    expect(fromUnknown({ success: false, error: { code: 'too_large', message: 'big' } }).code).toBe('video.too_large');
  });

  it('never picks an entry from a word inside free text', () => {
    expect(fromUnknown(new Error('failed')).code).toBe('common.internal');
    expect(fromUnknown(new Error('upload failed: job_dead')).code).toBe('common.internal');
  });

  it('anything else is common.internal (never retryable) and keeps the cause', () => {
    const boom = new Error('boom');
    const err = fromUnknown(boom);
    expect(err.code).toBe('common.internal');
    expect(err.kind).toBe('internal');
    expect(err.cause).toBe(boom);
  });
});

describe('forwardFor — the remix [Try again] loop cannot come back', () => {
  it('credits_short offers top_up only', () => {
    expect(forwardFor(fromUnknown('part:credits_short'))).toEqual(['top_up']);
  });

  it('retryable keeps try_again', () => {
    expect(forwardFor(catalogError('remix.sheet_not_ready'))).toContain('try_again');
  });

  it('strips try_again from a non-retryable entry even if one slipped in', () => {
    const entry = { ...catalogError('remix.route_blocked').entry, forward: ['try_again', 'change'] as const };
    expect(forwardFor(entry)).toEqual(['change']);
  });
});

describe('merchant copy', () => {
  const err = catalogError('billing.credits_short', { params: { needed: 120, available: 40 } });

  it('uses the managed row and fills params', () => {
    expect(merchantText(err, 'This needs {needed} credits; you have {available}.')).toBe('This needs 120 credits; you have 40.');
  });

  it('falls back and reports a missing row', () => {
    const missing: string[] = [];
    expect(merchantText(err, null, { onMissing: (k) => missing.push(k) })).toBe(err.entry.fallback);
    expect(missing).toEqual(['error.billing.credits_short']);
  });

  it('falls back when the row names a param that was not given', () => {
    const e = catalogError('billing.credits_short');
    expect(merchantText(e, 'You need {needed} credits.')).toBe(e.entry.fallback);
  });

  it('merchantLine resolves through the app store, and survives a throwing store', async () => {
    expect(await merchantLine(err, async (k) => (k === 'error.billing.credits_short' ? 'Top up to go on.' : null), 'en')).toBe('Top up to go on.');
    expect(await merchantLine(err, () => { throw new Error('db down'); })).toBe(err.entry.fallback);
  });
});

describe('wire shapes', () => {
  it('toToolResult carries the p152 shape and fails isFailureOutput-style checks', () => {
    const r = toToolResult('part:credits_short', { say: 'Top up to go on.' });
    expect(r.success).toBe(false);
    expect(r.isError).toBe(true);
    expect(r.error).toMatchObject({ code: 'billing.credits_short', ref: 'E1201', kind: 'needs_merchant', retry: false, resumes: true, said: false, forward: ['top_up'], say: 'Top up to go on.' });
    expect(r.error.fix).toMatch(/Do not retry/);
    expect(JSON.stringify(r)).not.toMatch(/stack/);
  });

  it('toToolResult said=true tells the agent the line is already posted', () => {
    expect(toToolResult('remix.route_blocked', { said: true }).error.said).toBe(true);
  });

  it('toOutcome gives remix {status, say, next}; said → say null', () => {
    expect(toOutcome('part:credits_short', { said: true })).toMatchObject({ status: 'refused', say: null, code: 'billing.credits_short', forward: ['top_up'] });
    expect(toOutcome('remix.route_blocked').say).toBe(catalogError('remix.route_blocked').entry.fallback);
  });

  it('toHttpBody gives status + p16 envelope', () => {
    const { status, body } = toHttpBody(catalogError('common.not_found'));
    expect(status).toBe(404);
    expect(body).toMatchObject({ success: false, error: { code: 'common.not_found', ref: 'E1004', message: expect.any(String) } });
  });

  it('readCatalogError reads tRPC data.catalog and REST bodies; unknown → undefined', () => {
    expect(readCatalogError({ data: { catalog: { code: 'billing.credits_short' } } })?.forward).toEqual(['top_up']);
    expect(readCatalogError(toHttpBody(catalogError('common.not_found')).body)?.code).toBe('common.not_found');
    expect(readCatalogError(new Error('random'))).toBeUndefined();
  });
});
