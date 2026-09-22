/**
 * The auth repository's `findByEmail` matches the STORED address
 * case-insensitively (p79 STORY-046; the users repository took the same rule
 * in STORY-042).
 *
 * This is the duplicate check behind `auth.register`. While it was exact
 * equality, a row saved as `Sean@x.com` was invisible to `sean@x.com` and
 * register allocated a SECOND local user for the same person — STORY-042
 * found it and left it for its own story.
 *
 * Classification: REAL drizzle SQL. The where clause the repository builds is
 * captured and rendered by the real `PgDialect` against real `pgTable`
 * columns, so the assertion is on the SQL Postgres would receive. No database
 * is contacted.
 */
import { describe, expect, it } from 'vitest';
import { PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';

import { createAuthRepositoryClass } from './repository';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  password: text('password'),
});

function captureSelect() {
  const captured: any[] = [];
  const db: any = {
    select: () => {
      const c: any = {
        from: () => c,
        where: (cond: any) => { captured.push(cond); return c; },
        limit: () => Promise.resolve([]),
      };
      return c;
    },
  };
  return { db, captured };
}

const Repository = createAuthRepositoryClass({ users, userRoles: {} as any } as any);

describe('auth repository — findByEmail (the register duplicate check)', () => {
  it('compares lower(users.email) against the lowered argument', async () => {
    const { db, captured } = captureSelect();

    await new Repository(db).findByEmail('Sean@X.com');

    expect(captured).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(captured[0]);
    expect(query.sql).toBe('lower("users"."email") = lower($1)');
    expect(query.params).toEqual(['Sean@X.com']);
  });

  it('findById is untouched — only the email lookup changed', async () => {
    const { db, captured } = captureSelect();

    await new Repository(db).findById(7);

    const query = new PgDialect().sqlToQuery(captured[0]);
    expect(query.sql).toBe('"users"."id" = $1');
  });
});
