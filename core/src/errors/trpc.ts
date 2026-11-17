/**
 * tRPC mapping for the error catalog. Separate entry (`@jetdevs/core/errors/trpc`) so the root
 * `@jetdevs/core/errors` stays dependency-free for Fastify services (D9).
 */
import { TRPCError } from '@trpc/server';
import { fromUnknown, isCatalogError } from './error';
import { forwardFor } from './render';

/** Any error → a TRPCError whose code comes from the catalog and whose `cause` is the CatalogError. */
export function toTRPCError(e: unknown): TRPCError {
  if (e instanceof TRPCError && isCatalogError(e.cause)) return e;
  const err = fromUnknown(e);
  return new TRPCError({ code: err.entry.trpc, message: err.entry.fallback, cause: err });
}

/** The fields the formatter adds under `error.data.catalog`. */
export interface TRPCCatalogData {
  code: string;
  ref: string;
  kind: string;
  forward: string[];
}

/**
 * Catalog data for a tRPC `errorFormatter`: `data: { ...shape.data, catalog: catalogDataOf(error) }`.
 * Returns undefined for errors not raised from the catalog, so existing shapes stay byte-identical.
 */
export function catalogDataOf(error: unknown, opts: { all?: boolean } = {}): TRPCCatalogData | undefined {
  const cause = error instanceof TRPCError ? error.cause : error;
  const err = isCatalogError(cause) ? cause : opts.all ? fromUnknown(error) : undefined;
  if (!err) return undefined;
  return { code: err.code, ref: err.ref, kind: err.kind, forward: forwardFor(err) };
}
