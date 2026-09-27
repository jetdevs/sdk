/**
 * Regression: getAvailableRolesForOrg built invalid SQL (`and  = $2`).
 *
 * 5079108 added `eq(roles.roleCategory, category)`, but core's `roles` table
 * has no `roleCategory` column (and no consumer DB has `role_category`), so the
 * column was `undefined` and rendered as an empty identifier. That broke the
 * Users add/edit dialog role picker in every app on core >= 0.1.42-dev.
 *
 * The query is built by drizzle's real QueryBuilder against real pgTables and
 * rendered to SQL — no database needed.
 */

import { describe, expect, it } from 'vitest';
import { QueryBuilder, boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { createUserOrgRepository } from './user-org.repository';
import { roles, userRoles, users, orgs } from '../../db/schema';

/** Fake db: delegates select().from().where().orderBy() to a real QueryBuilder and captures SQL. */
function makeCapturingDb() {
  const captured: { sql: string; params: unknown[] }[] = [];
  const qb = new QueryBuilder();
  const db = {
    select: (fields?: any) => ({
      from: (table: any) => {
        const base = (fields ? qb.select(fields) : qb.select()).from(table);
        return {
          where: (w: any) => {
            const withWhere = base.where(w);
            return {
              orderBy: (...o: any[]) => {
                captured.push(withWhere.orderBy(...o).toSQL());
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    }),
  };
  return { db: db as any, captured };
}

function assertValidWhere(sql: string) {
  // The bug signature: an empty column before an operator.
  expect(sql).not.toMatch(/(and|or|\()\s+=/i);
  expect(sql).not.toMatch(/""/);
}

describe('getAvailableRolesForOrg — role category filter', () => {
  it("core's roles table (no roleCategory column): valid SQL, no category filter", async () => {
    const Repo = createUserOrgRepository({ tables: { roles, userRoles, users, orgs } });
    const { db, captured } = makeCapturingDb();

    await new Repo(db).getAvailableRolesForOrg(7);

    expect(captured).toHaveLength(1);
    const { sql, params } = captured[0];
    assertValidWhere(sql);
    expect(sql).not.toContain('role_category');
    expect(params).not.toContain('user');
    expect(sql).toContain('"roles"."is_active" = $1');
    expect(sql).toContain('"roles"."org_id" = $2');
  });

  it("core's roles table: service roles cannot exist → [] without querying", async () => {
    const Repo = createUserOrgRepository({ tables: { roles, userRoles, users, orgs } });
    const { db, captured } = makeCapturingDb();

    await expect(new Repo(db).getAvailableServiceRoles(7)).resolves.toEqual([]);
    expect(captured).toHaveLength(0);
  });

  it('app roles table WITH roleCategory: filter is applied', async () => {
    const rolesWithCategory = pgTable('roles', {
      id: serial('id').primaryKey(),
      name: text('name').notNull(),
      orgId: integer('org_id'),
      isSystemRole: boolean('is_system_role').notNull(),
      isGlobalRole: boolean('is_global_role').notNull(),
      isActive: boolean('is_active').notNull(),
      roleCategory: text('role_category').notNull(),
    });
    const Repo = createUserOrgRepository({
      tables: { roles: rolesWithCategory, userRoles, users, orgs },
    });
    const { db, captured } = makeCapturingDb();

    await new Repo(db).getAvailableServiceRoles(7);

    const { sql, params } = captured[0];
    assertValidWhere(sql);
    expect(sql).toContain('"roles"."role_category" = $2');
    expect(params[1]).toBe('service');
  });
});
