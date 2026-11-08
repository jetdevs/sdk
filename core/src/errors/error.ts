import { ERROR_CATALOG, type ErrorCode } from './catalog';
import type { ErrorEntry, ErrorKind, ErrorParams } from './types';

const BRAND = Symbol.for('@jetdevs/core/errors.CatalogError');

export interface CatalogErrorOptions {
  /** Values for `{name}` placeholders in the merchant copy row. */
  params?: ErrorParams;
  /** The underlying error, kept for logs (never sent to merchants or agents). */
  cause?: unknown;
  /** Short engineer-facing detail for logs (never sent to merchants). */
  detail?: string;
}

/** A failure raised from the catalog. `.message` is the English fallback, for logs only. */
export class CatalogError extends Error {
  readonly code: ErrorCode;
  readonly ref: string;
  readonly kind: ErrorKind;
  readonly entry: ErrorEntry;
  readonly params: ErrorParams;
  readonly detail: string | undefined;
  /** The raw value `fromUnknown` matched, when the error came from a legacy string or foreign error. */
  readonly source: string | undefined;

  constructor(code: ErrorCode, opts: CatalogErrorOptions & { source?: string } = {}) {
    const entry = ERROR_CATALOG[code];
    if (!entry) throw new Error(`[errors] unknown catalog code: ${String(code)}`);
    super(entry.fallback, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'CatalogError';
    this.code = code;
    this.ref = entry.ref;
    this.kind = entry.kind;
    this.entry = entry;
    this.params = opts.params ?? {};
    this.detail = opts.detail;
    this.source = opts.source;
    Object.defineProperty(this, BRAND, { value: true });
  }
}

/** True for a CatalogError, also across duplicate copies of this package (brand via Symbol.for). */
export function isCatalogError(e: unknown): e is CatalogError {
  return typeof e === 'object' && e !== null && (e as Record<symbol, unknown>)[BRAND] === true;
}

/** Build a CatalogError without throwing (for result-style code: `{ ok:false, error }`). */
export function catalogError(code: ErrorCode, opts?: CatalogErrorOptions): CatalogError {
  return new CatalogError(code, opts);
}

/** Throw a CatalogError. The one way to raise a failure a merchant or agent can see. */
export function raise(code: ErrorCode, opts?: CatalogErrorOptions): never {
  throw new CatalogError(code, opts);
}

// ---------------------------------------------------------------------------
// lookup: code, alias, ref, or a prefixed legacy string → entry
// ---------------------------------------------------------------------------

const INDEX: ReadonlyMap<string, ErrorCode> = (() => {
  const m = new Map<string, ErrorCode>();
  const put = (key: string, code: ErrorCode) => {
    const prev = m.get(key);
    if (prev && prev !== code) throw new Error(`[errors] key "${key}" maps to both ${prev} and ${code}`);
    m.set(key, code);
  };
  for (const [code, e] of Object.entries(ERROR_CATALOG) as Array<[ErrorCode, ErrorEntry]>) {
    put(code, code);
    put(e.ref, code);
    for (const a of e.aliases ?? []) put(a, code);
  }
  return m;
})();

const MAX_SEGMENTS = 8;

/**
 * Resolve any spelling to a catalog entry, or `undefined`.
 *
 * Accepts the code (`billing.credits_short`), the ref (`E1201`), an alias (`402:credits_short`,
 * `NO_CREDITS`) or a legacy cause with step prefixes and trailing ids
 * (`part:credits_short`, `start:402:credits_short`, `join:job_dead:3dc16981-…`). It tries every
 * `:`-separated window, left to right, longest first, so `part:402:credits_short` hits the alias
 * `402:credits_short` before the bare tail.
 */
export function lookup(value: unknown): ErrorEntry | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  if (!s) return undefined;
  const direct = INDEX.get(s);
  if (direct) return ERROR_CATALOG[direct];
  const segs = s.split(':').slice(0, MAX_SEGMENTS);
  for (let i = 0; i < segs.length; i++) {
    for (let j = segs.length; j > i; j--) {
      const hit = INDEX.get(segs.slice(i, j).join(':'));
      if (hit) return ERROR_CATALOG[hit];
    }
  }
  return undefined;
}

/** A whole catalog code or ref only (no aliases, no windows): what free-text messages may match. */
function codeOrRef(value: string): ErrorEntry | undefined {
  const byCode = (ERROR_CATALOG as Readonly<Record<string, ErrorEntry>>)[value];
  if (byCode) return byCode;
  const code = /^E\d{4}$/.test(value) ? INDEX.get(value) : undefined;
  return code ? ERROR_CATALOG[code] : undefined;
}

/** tRPC code → catalog code, used only when nothing more specific matched. */
const TRPC_TO_CODE: Readonly<Record<string, ErrorCode>> = {
  BAD_REQUEST: 'common.invalid_input',
  PARSE_ERROR: 'common.invalid_input',
  UNPROCESSABLE_CONTENT: 'common.invalid_input',
  UNAUTHORIZED: 'common.unauthorized',
  FORBIDDEN: 'common.forbidden',
  NOT_FOUND: 'common.not_found',
  CONFLICT: 'common.conflict',
  PRECONDITION_FAILED: 'common.invalid_input',
  TOO_MANY_REQUESTS: 'common.rate_limited',
  TIMEOUT: 'common.timeout',
  GATEWAY_TIMEOUT: 'common.timeout',
  SERVICE_UNAVAILABLE: 'common.unavailable',
  BAD_GATEWAY: 'common.unavailable',
  PAYMENT_REQUIRED: 'billing.credits_short',
};

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Candidate code strings carried by an unknown error-like value, most specific first.
 * `exact` candidates (free-text messages) only match a whole catalog code or ref, never an alias or a `:` window,
 * so a message that happens to contain a word like "failed" cannot pick an entry.
 */
function candidates(e: unknown): Array<{ value: string; exact: boolean }> {
  if (typeof e === 'string') return [{ value: e, exact: false }];
  if (typeof e !== 'object' || e === null) return [];
  const o = e as Record<string, unknown>;
  const obj = (v: unknown) => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : undefined);
  const err = obj(o.error);
  const catalog = obj(obj(o.data)?.catalog);
  const coded = [
    str(catalog?.code),
    str(err?.code),
    str(o.errorCode),
    // a status + code pair (`{status:402, code:'credits_short'}`) → '402:credits_short'
    typeof o.status === 'number' && str(o.code) ? `${o.status}:${o.code as string}` : undefined,
    str(o.code),
    typeof o.cause === 'string' ? o.cause : undefined,
  ];
  const texts = [str(err?.message), str(o.message)];
  return [
    ...coded.filter((x): x is string => !!x).map((value) => ({ value, exact: false })),
    ...texts.filter((x): x is string => !!x).map((value) => ({ value: value.trim(), exact: true })),
  ];
}

/**
 * Anything → CatalogError. CatalogError passes through; a value whose code/alias/cause matches the
 * catalog becomes that entry; a TRPCError-like `{code:'NOT_FOUND'}` maps by tRPC code; everything
 * else is `common.internal` (kind `internal`: never retryable), with the original kept as `cause`.
 */
export function fromUnknown(e: unknown, opts: Omit<CatalogErrorOptions, 'cause'> = {}): CatalogError {
  if (isCatalogError(e)) return e;
  for (const c of candidates(e)) {
    const hit = c.exact ? codeOrRef(c.value) : lookup(c.value);
    if (hit) return new CatalogError(hit.code as ErrorCode, { ...opts, cause: e, source: c.value });
  }
  const trpcCode = typeof e === 'object' && e !== null ? str((e as Record<string, unknown>).code) : undefined;
  const mapped = trpcCode ? TRPC_TO_CODE[trpcCode] : undefined;
  if (mapped) return new CatalogError(mapped, { ...opts, cause: e, source: trpcCode });
  return new CatalogError('common.internal', { ...opts, cause: e, source: typeof e === 'string' ? e : undefined });
}
