/**
 * User output safety
 *
 * A users row carries the local password verifier (`password`, a bcrypt hash).
 * No API response may contain it, or any other secret column an app adds to
 * its users table. These helpers are the one place that decides which keys
 * are secret, used by the SDK repository (column selection) and the SDK user
 * router (output strip). Apps that override a user procedure and return a
 * users row must pass it through `omitUserSecrets` too.
 *
 * @module @jetdevs/core/users
 */

import { getTableColumns } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/** Exact column keys that are secrets. */
const SECRET_USER_KEYS = new Set(['password', 'passwordHash', 'hashedPassword']);

/** Any key naming a secret or a token (`mfaSecret`, `resetToken`, ...). */
const SECRET_USER_KEY_PATTERN = /password|secret|token$|tokens$|recoveryCodes/i;

/** Flags such as `hasPassword` say a secret exists without carrying it. */
const PRESENCE_FLAG_PATTERN = /^(has|is)[A-Z]/;

/** True when a users-row key must never leave the server. */
export function isUserSecretKey(key: string): boolean {
  if (PRESENCE_FLAG_PATTERN.test(key)) return false;
  return SECRET_USER_KEYS.has(key) || SECRET_USER_KEY_PATTERN.test(key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Return a copy of `value` with every secret key removed, at any depth of
 * plain objects and arrays. Dates, class instances and primitives pass
 * through unchanged.
 */
export function omitUserSecrets<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => omitUserSecrets(item)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (isUserSecretKey(key)) continue;
    out[key] = omitUserSecrets(field);
  }
  return out as T;
}

/**
 * The columns of a users table that are safe to return: every column except
 * the secret ones. Pass to `db.select(...)` / `.returning(...)`.
 */
export function publicUserColumns(users: PgTable): Record<string, any> {
  return Object.fromEntries(
    Object.entries(getTableColumns(users)).filter(([key]) => !isUserSecretKey(key)),
  );
}
