import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { catalogError, isCatalogError } from '../index';
import { catalogDataOf, toTRPCError } from '../trpc';

describe('errors/trpc', () => {
  it('toTRPCError uses the catalog tRPC code and keeps the CatalogError as cause', () => {
    const t = toTRPCError(catalogError('billing.credits_short'));
    expect(t).toBeInstanceOf(TRPCError);
    expect(t.code).toBe('PAYMENT_REQUIRED');
    expect(isCatalogError(t.cause)).toBe(true);
  });

  it('toTRPCError maps legacy strings', () => {
    expect(toTRPCError('402:credits_short').code).toBe('PAYMENT_REQUIRED');
    expect(toTRPCError(new Error('boom')).code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('catalogDataOf feeds the errorFormatter; foreign errors stay untouched', () => {
    expect(catalogDataOf(toTRPCError(catalogError('remix.route_blocked')))).toEqual({
      code: 'remix.route_blocked', ref: 'E2107', kind: 'blocked', forward: ['pick_other', 'change'],
    });
    expect(catalogDataOf(new TRPCError({ code: 'NOT_FOUND' }))).toBeUndefined();
    expect(catalogDataOf(new TRPCError({ code: 'NOT_FOUND' }), { all: true })?.code).toBe('common.not_found');
  });
});
