/**
 * Test support (p77 STORY-001): a db stub that `withCredentialWrite` can open a
 * transaction on. The seam refuses a handle without `transaction()`, and runs
 * three `SET LOCAL`s through `tx.execute` before the writer's body.
 *
 * `transaction`, `execute`, `tx` and `statements` are NON-enumerable, so a stub
 * built from `{ handle: 'x' }` still `toEqual`s `{ handle: 'x' }` and its tx
 * `toEqual`s `{ handle: 'x:tx' }` — the existing handle assertions keep their
 * shape and now say which handle (the db or the tx) a hook received.
 */
import { PgDialect } from 'drizzle-orm/pg-core';

const dialect = new PgDialect();

/** Render whatever the seam passed to `execute` (a drizzle `sql` object) to text. */
export function renderSql(query: any): string {
  if (typeof query === 'string') return query;
  try {
    return dialect.sqlToQuery(query).sql;
  } catch {
    return String(query);
  }
}

export interface TransactionalStub {
  [key: string]: any;
  /** The handle `transaction(fn)` passes to `fn`. */
  readonly tx: any;
  /** Every statement executed on the tx, rendered, in order. */
  readonly statements: string[];
  /** How many transactions were opened. */
  readonly transactionsOpened: () => number;
}

export function transactionalStub<T extends object>(
  base: T = { handle: 'the-db' } as unknown as T,
  txBase?: object,
): T & TransactionalStub {
  const statements: string[] = [];
  let opened = 0;
  const label = (base as any).handle;
  const tx: any = { ...(txBase ?? (label !== undefined ? { handle: `${label}:tx` } : {})) };
  Object.defineProperty(tx, 'execute', {
    value: async (q: any) => {
      statements.push(renderSql(q));
      return [];
    },
    enumerable: false,
  });
  const db: any = { ...base };
  Object.defineProperty(db, 'transaction', {
    value: async (fn: (t: any) => Promise<any>) => {
      opened += 1;
      return fn(tx);
    },
    enumerable: false,
  });
  Object.defineProperty(db, 'tx', { value: tx, enumerable: false });
  Object.defineProperty(db, 'statements', { value: statements, enumerable: false });
  Object.defineProperty(db, 'transactionsOpened', { value: () => opened, enumerable: false });
  return db;
}
