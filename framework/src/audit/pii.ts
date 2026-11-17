/**
 * Never-log-PII field policy.
 *
 * Key names are normalised (lowercase, `_`/`-`/space stripped) and compared
 * exactly against the set, so `api_key`, `apiKey`, `API-KEY` all match while
 * `author` does not (yobo's old substring match flagged `auth*`).
 */

const norm = (k: string): string => k.toLowerCase().replace(/[_\-\s]/g, '');

/** Union of yobo SENSITIVE_FIELDS (secrets) plus contact PII. */
export const DEFAULT_NEVER_LOG_FIELDS: readonly string[] = [
  // secrets / credentials
  'password', 'passwordhash', 'secret', 'clientsecret', 'token', 'accesstoken', 'refreshtoken',
  'idtoken', 'sessiontoken', 'apikey', 'privatekey', 'credential', 'credentials',
  'authorization', 'auth', 'cookie', 'otp', 'pin', 'cvv', 'cvc',
  // financial / government ids
  'ssn', 'creditcard', 'cardnumber', 'iban', 'taxid', 'passport',
  // contact PII
  'email', 'phone', 'phonenumber', 'mobile', 'address', 'streetaddress', 'dob', 'dateofbirth',
];

export class AuditPiiError extends Error {
  readonly fields: string[];
  constructor(fields: string[]) {
    super(`Audit event refused: never-log fields present: ${fields.join(', ')}`);
    this.name = 'AuditPiiError';
    this.fields = fields;
  }
}

export interface AuditPolicyOptions {
  /** Replaces the default never-log set. */
  neverLog?: readonly string[];
  /** Extra never-log fields added to the set. */
  extraNeverLog?: readonly string[];
  /** Fields exempted from the set (e.g. an app that deliberately audits `email`). */
  allow?: readonly string[];
  /** `refuse` (default) throws AuditPiiError; `redact` replaces the value with '[REDACTED]'. */
  mode?: 'refuse' | 'redact';
}

export interface AuditPolicy {
  /** Returns the dotted paths of never-log keys found in `data` (nested objects + arrays). */
  findViolations(data: unknown): string[];
  /** Applies the mode: returns clean data, or throws AuditPiiError. */
  enforce<T extends Record<string, unknown> | null | undefined>(data: T): T;
}

export function createAuditPolicy(opts: AuditPolicyOptions = {}): AuditPolicy {
  const blocked = new Set((opts.neverLog ?? DEFAULT_NEVER_LOG_FIELDS).map(norm));
  for (const f of opts.extraNeverLog ?? []) blocked.add(norm(f));
  for (const f of opts.allow ?? []) blocked.delete(norm(f));
  const mode = opts.mode ?? 'refuse';

  const walk = (value: unknown, path: string, out: string[], redact: boolean): unknown => {
    if (Array.isArray(value)) {
      return value.map((v, i) => walk(v, `${path}[${i}]`, out, redact));
    }
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        const p = path ? `${path}.${k}` : k;
        if (blocked.has(norm(k))) {
          out.push(p);
          clean[k] = '[REDACTED]';
        } else {
          clean[k] = walk(v, p, out, redact);
        }
      }
      return clean;
    }
    return value;
  };

  return {
    findViolations(data) {
      const out: string[] = [];
      walk(data, '', out, false);
      return out;
    },
    enforce(data) {
      if (!data) return data;
      const hits: string[] = [];
      const clean = walk(data, '', hits, true) as typeof data;
      if (hits.length === 0) return data;
      if (mode === 'redact') return clean;
      throw new AuditPiiError(hits);
    },
  };
}
