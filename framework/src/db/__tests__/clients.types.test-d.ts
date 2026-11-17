/**
 * Type-level tests for `createDbClients`: a real drizzle db (postgres-js and
 * node-postgres flavours) must satisfy `TransactionalDb` with no cast, and
 * `TxOf<TDb>` must resolve to the driver's real transaction type.
 *
 * Checked by `tsc` (see `tsconfig.typetest.json`) and by vitest typecheck.
 */
import { expectTypeOf, test } from 'vitest';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { createDbClients, type TransactionalDb, type TxOf } from '../clients';

test('postgres-js db satisfies TransactionalDb', () => {
  expectTypeOf<PostgresJsDatabase>().toExtend<TransactionalDb>();
  expectTypeOf<PostgresJsDatabase<Record<string, never>>>().toExtend<TransactionalDb>();
});

test('node-postgres db satisfies TransactionalDb', () => {
  expectTypeOf<NodePgDatabase>().toExtend<TransactionalDb>();
  expectTypeOf<NodePgDatabase<Record<string, never>>>().toExtend<TransactionalDb>();
});

test('TxOf infers the real drizzle transaction type', () => {
  expectTypeOf<TxOf<PostgresJsDatabase>>().toHaveProperty('rollback');
  expectTypeOf<TxOf<PostgresJsDatabase>>().toHaveProperty('insert');
  expectTypeOf<TxOf<NodePgDatabase>>().toHaveProperty('rollback');
  expectTypeOf<TxOf<PostgresJsDatabase>>().not.toBeNever();
  expectTypeOf<TxOf<NodePgDatabase>>().not.toBeNever();
  expectTypeOf<TxOf<PgDatabase<PgQueryResultHKT>>>().not.toBeNever();
});

test('createDbClients accepts a real drizzle db with no cast', () => {
  const clients = createDbClients<PostgresJsDatabase>({
    appUrl: 'postgres://x',
    connect: (): PostgresJsDatabase => {
      throw new Error('type-test only');
    },
    setRlsContext: async (tx, ctx) => {
      expectTypeOf(tx).toEqualTypeOf<TxOf<PostgresJsDatabase>>();
      expectTypeOf(ctx.orgId).toBeNumber();
    },
  });
  expectTypeOf(clients.db).toEqualTypeOf<PostgresJsDatabase>();
  void clients.dbWithRLS(1, async (tx) => {
    expectTypeOf(tx).toEqualTypeOf<TxOf<PostgresJsDatabase>>();
    expectTypeOf(tx.execute).toBeFunction();
    return 1;
  });
  void clients.withPrivilegedDb('why', async (tx) => {
    expectTypeOf(tx).toEqualTypeOf<TxOf<PostgresJsDatabase>>();
    return 'x';
  });

  createDbClients<NodePgDatabase>({
    appUrl: 'postgres://x',
    connect: (): NodePgDatabase => {
      throw new Error('type-test only');
    },
    setRlsContext: async () => undefined,
  });
});
