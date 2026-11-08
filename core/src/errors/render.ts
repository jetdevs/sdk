import { ERROR_CATALOG, FORWARD_FALLBACK_LABELS, type ErrorCode } from './catalog';
import { CatalogError, fromUnknown, isCatalogError } from './error';
import type { ErrorEntry, ErrorKind, ErrorParams, ForwardKey } from './types';

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

function fill(template: string, params: ErrorParams): string | null {
  let missing = false;
  const out = template.replace(PLACEHOLDER, (_m, name: string) => {
    const v = params[name];
    if (v === undefined || v === null || v === '') {
      missing = true;
      return '';
    }
    return String(v);
  });
  return missing ? null : out.replace(/\s+/g, ' ').trim();
}

export interface MerchantTextOptions {
  /** Called when the copy row is missing or unusable, so the app can log `error_copy_row_missing`. */
  onMissing?: (copyKey: string, err: CatalogError) => void;
}

/**
 * The merchant's sentence, from the row text the app already resolved for `copyKeyOf(err)`.
 * Uses the row when present and every `{param}` it names is given; otherwise the catalog fallback.
 */
export function merchantText(err: CatalogError, rowText: string | null | undefined, opts: MerchantTextOptions = {}): string {
  const row = typeof rowText === 'string' && rowText.trim() ? fill(rowText, err.params) : null;
  if (row) return row;
  opts.onMissing?.(err.entry.copyKey, err);
  return err.entry.fallback;
}

/** The managed copy key of an error's merchant sentence (`error.<code>`). */
export function copyKeyOf(err: CatalogError): string {
  return err.entry.copyKey;
}

/** Copy resolver an app passes in: its own store (system_config rows, next-intl, DB keys). */
export type CopyResolver = (copyKey: string, locale?: string) => string | null | undefined | Promise<string | null | undefined>;

/** Async convenience over `merchantText`: resolves the row through the app's store first. */
export async function merchantLine(err: CatalogError, resolve: CopyResolver, locale?: string, opts?: MerchantTextOptions): Promise<string> {
  let row: string | null | undefined;
  try {
    row = await resolve(err.entry.copyKey, locale);
  } catch {
    row = null;
  }
  return merchantText(err, row, opts);
}

/**
 * The forward keys a surface may draw for this error. `try_again` is removed unless the kind is
 * `retryable` (D3) — belt and braces over the catalog test, because a [Try again] on a refusal that
 * cannot succeed loops the merchant forever (yobo dev run 3dc16981).
 */
export function forwardFor(err: CatalogError | ErrorEntry): ForwardKey[] {
  const entry = isCatalogError(err) ? err.entry : err;
  return entry.forward.filter((k: ForwardKey) => k !== 'try_again' || entry.kind === 'retryable').slice(0, 3);
}

/** Managed copy key of a forward button label. */
export function forwardCopyKey(key: ForwardKey): string {
  return `error.forward.${key}`;
}

/** English fallback label of a forward button (≤ 20 chars). */
export function forwardFallbackLabel(key: ForwardKey): string {
  return FORWARD_FALLBACK_LABELS[key];
}

/** Engineer + agent facing fields shared by the wire shapes. Compact by design: no stack, no upstream body. */
interface WireCore {
  code: string;
  ref: string;
  kind: ErrorKind;
  forward: ForwardKey[];
}

function core(err: CatalogError): WireCore {
  return { code: err.code, ref: err.ref, kind: err.kind, forward: forwardFor(err) };
}

export interface HttpErrorBody {
  success: false;
  error: WireCore & {
    /** The merchant sentence (resolved line when given, else the fallback). */
    message: string;
    agent: { reason: string; fix: string; ask: string | null; retry: boolean; resumes: boolean };
  };
}

/** REST body: the p16 envelope `{success:false,error:{code,message}}` plus ref, kind, forward and agent. */
export function toHttpBody(e: unknown, line?: string): { status: number; body: HttpErrorBody } {
  const err = fromUnknown(e);
  const a = err.entry.agent;
  return {
    status: err.entry.http,
    body: {
      success: false,
      error: { ...core(err), message: line ?? err.entry.fallback, agent: { ...a, resumes: err.entry.resumes } },
    },
  };
}

export interface ToolErrorResult {
  success: false;
  isError: true;
  error: WireCore & {
    reason: string;
    fix: string;
    ask: string | null;
    retry: boolean;
    resumes: boolean;
    /** The merchant sentence. The agent relays it ONLY when `said` is false. */
    say: string;
    /** True when code already posted the merchant line: the agent sends nothing more. */
    said: boolean;
  };
}

export interface ToolResultOptions {
  /** The resolved merchant line (from `merchantLine`); default the catalog fallback. */
  say?: string;
  /** Set true when code already posted the line + buttons to the merchant. */
  said?: boolean;
}

/** Fixed first line of `fix` when code already posted the merchant line (agents-lead-5, 2026-11-08). */
export const ALREADY_TOLD = 'The merchant was already told; send nothing more.';

/**
 * Agent tool result (p152 refusal shape). Passes cadra-api `isFailureOutput` (`success === false`).
 * `said` stops the double-line bug: when code already posted the line, the agent must stay quiet.
 */
export function toToolResult(e: unknown, opts: ToolResultOptions = {}): ToolErrorResult {
  const err = fromUnknown(e);
  const a = err.entry.agent;
  return {
    success: false,
    isError: true,
    error: {
      ...core(err),
      reason: a.reason,
      fix: opts.said ? `${ALREADY_TOLD} ${a.fix}` : a.fix,
      ask: a.ask,
      retry: a.retry,
      resumes: err.entry.resumes,
      say: opts.say ?? err.entry.fallback,
      said: opts.said ?? false,
    },
  };
}

/** Remix outcome `{status, say, next}` (slides `remix-outcome.ts`, yobo `src/server/tools/remix-outcome.ts`). */
export interface ErrorOutcome {
  status: 'refused';
  /** null when code already posted the line (the agent says nothing). */
  say: string | null;
  next: string;
  code: string;
  ref: string;
  kind: ErrorKind;
  forward: ForwardKey[];
}

/** Remix outcome for a refusal. Pass `said: true` when the line + buttons were already posted. */
export function toOutcome(e: unknown, opts: ToolResultOptions = {}): ErrorOutcome {
  const err = fromUnknown(e);
  return {
    status: 'refused',
    say: opts.said ? null : (opts.say ?? err.entry.fallback),
    next: opts.said ? `${ALREADY_TOLD} ${err.entry.agent.fix}` : err.entry.agent.fix,
    ...core(err),
  };
}

/** The compact, additive catalog fields a boundary adds beside its existing error body (no message, no stack). */
export interface BoundaryCatalogFields {
  code: string;
  ref: string;
  kind: ErrorKind;
  forward: ForwardKey[];
  fix: string;
  retry: boolean;
}

/** Catalog fields for any error, to add beside an existing body (`{ success:false, error, catalog }`). */
export function boundaryFields(e: unknown): BoundaryCatalogFields {
  const err = fromUnknown(e);
  return { code: err.code, ref: err.ref, kind: err.kind, forward: forwardFor(err), fix: err.entry.agent.fix, retry: err.entry.agent.retry };
}

/** What a client (web) needs to render an error: read from a tRPC client error or a REST body. */
export interface ClientCatalogError {
  code: ErrorCode;
  ref: string;
  kind: ErrorKind;
  forward: ForwardKey[];
  copyKey: string;
  fallback: string;
}

/** Read the catalog fields off a tRPC client error (`error.data.catalog`) or a REST error body. */
export function readCatalogError(e: unknown): ClientCatalogError | undefined {
  const err = fromUnknown(e);
  if (err.code === 'common.internal' && !err.source) {
    // nothing recognisable: keep `undefined` so the caller shows its own generic state
    const o = typeof e === 'object' && e !== null ? (e as Record<string, unknown>) : undefined;
    const data = o && typeof o.data === 'object' && o.data !== null ? (o.data as Record<string, unknown>) : undefined;
    if (!data?.catalog) return undefined;
  }
  const entry = ERROR_CATALOG[err.code];
  return { code: err.code, ref: err.ref, kind: err.kind, forward: forwardFor(err), copyKey: entry.copyKey, fallback: entry.fallback };
}
