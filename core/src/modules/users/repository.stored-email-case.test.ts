/**
 * `findByEmail` matches the STORED address case-insensitively.
 *
 * This is the existence check behind `invite` and `create`. While it was exact
 * equality, a row saved as `Sean@x.com` was invisible to `sean@x.com`, so the
 * writers allocated a SECOND account for the same person — the legacy-case
 * problem STORY-040 found in the reset flow, on the other side of the same
 * column.
 *
 * Classification: REAL drizzle SQL. The where clause the repository builds is
 * captured and rendered by the real `PgDialect` against real `pgTable`
 * columns, so the assertion is on the SQL Postgres would receive. No database
 * is contacted.
 */
import { describe, expect, it } from 'vitest';
import { PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';

import { createUserRepositoryClass } from './repository';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull(),
  username: text('username'),
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

const Repository = createUserRepositoryClass({
  users,
  userRoles: {} as any,
  roles: {} as any,
  orgs: {} as any,
  permissions: {} as any,
  rolePermissions: {} as any,
} as any);

describe('users repository — findByEmail', () => {
  it('compares lower(users.email) against the lowered argument', async () => {
    const { db, captured } = captureSelect();

    await new Repository().findByEmail(db, 'Sean@X.com');

    expect(captured).toHaveLength(1);
    const query = new PgDialect().sqlToQuery(captured[0]);
    expect(query.sql).toBe('lower("users"."email") = lower($1)');
    expect(query.params).toEqual(['Sean@X.com']);
  });

  it('findByUsername is untouched — only the email column changed', async () => {
    const { db, captured } = captureSelect();

    await new Repository().findByUsername(db, 'Sean');

    const query = new PgDialect().sqlToQuery(captured[0]);
    expect(query.sql).toBe('"users"."username" = $1');
  });
});
