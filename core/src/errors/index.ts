/**
 * @jetdevs/core/errors — the one error catalog every app raises from.
 * Spec: _context/core-sdk/_specs/error-catalog/specs.md. Zero runtime dependencies.
 *
 *   import { raise, fromUnknown, toToolResult, merchantLine, forwardFor } from '@jetdevs/core/errors'
 *   raise('billing.credits_short', { params: { needed: 120, available: 40 } })
 */
export { ERROR_CATALOG, FORWARD_FALLBACK_LABELS, type ErrorCode } from './catalog';
export { CatalogError, catalogError, fromUnknown, isCatalogError, lookup, raise, type CatalogErrorOptions } from './error';
export {
  ALREADY_TOLD,
  copyKeyOf,
  forwardCopyKey,
  forwardFallbackLabel,
  forwardFor,
  merchantLine,
  merchantText,
  readCatalogError,
  toHttpBody,
  toOutcome,
  toToolResult,
  type ClientCatalogError,
  type CopyResolver,
  type ErrorOutcome,
  type HttpErrorBody,
  type MerchantTextOptions,
  type ToolErrorResult,
  type ToolResultOptions,
} from './render';
export type { AgentHint, ErrorEntry, ErrorEntryDef, ErrorKind, ErrorParams, ForwardKey, TRPCCodeName } from './types';
