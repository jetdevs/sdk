/**
 * RLS database clients factory.
 *
 * Ported from cadra-web `src/db/clients.ts` (the most complete app copy; same
 * shape in core-saas, yobo-merchant, crm and engage). The app-specific parts
 * (env names, driver, schema import, pool sizes) are injected:
 *
 * - `connect` builds a driver client for a URL (apps keep their own
 *   postgres.js / drizzle setup and pool sizes there).
 * - `setRlsContext` is the ONE setter of `rls.current_org_id`. Pass
 *   `setRlsContext` from `@jetdevs/core/rls`; this module never writes the
 *   variable itself, so there is a single place that names it.
 *
 * Differences from the app copies, all fail-closed:
 * - `dbWithRLS` throws when the org id is not a positive integer or when the
 *   context cannot be set (the apps logged and ran the query anyway).
 * - `withPrivilegedDb` requires a non-empty reason and reports it through
 *   `onPrivilegedAccess` before any query runs.
 * - No silent fall-back to non-transactional execution (cadra-web retried the
 *   operation outside a transaction on any error mentioning "transaction").
 *
 * @module @jetdevs/framework/db/clients
 */

import { sql, type SQL } from 'drizzle-orm';

// =============================================================================
// TYPES
// =============================================================================

/** Anything that can run a drizzle `sql` query (a db or a transaction). */
export interface SqlExecutor {
  execute(query: SQL): PromiseLike<unknown>;
}

/**
 * A client that can open a transaction (drizzle `PgDatabase`, so both
 * `PostgresJsDatabase` and `NodePgDatabase`, fit with no cast).
 *
 * The callback takes `unknown`, not `never`: a driver's `transaction` accepts
 * a callback over its own transaction type, and a callback over `unknown`
 * is assignable to that. `never` made every real drizzle db fail the
 * constraint. The concrete handle type comes from `TxOf<TDb>`, not from here.
 */
export interface TransactionalDb {
  transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

/** The transaction handle type a client passes to its `transaction` callback. */
export type TxOf<TDb> = TDb extends {
  transaction<T>(fn: (tx: infer TTx) => Promise<T>, ...rest: never[]): Promise<T>;
}
  ? TTx
  : never;

/** Which connection `connect` is asked to build. */
export type DbClientRole = 'app' | 'privileged';

/** RLS context handed to the injected setter. */
export interface RlsContextValues {
  orgId: number;
  userId?: number;
}

/** Reported once per `withPrivilegedDb` call, before the operation runs. */
export interface PrivilegedAccessEvent {
  reason: string;
  at: Date;
}

export interface CreateDbClientsOptions<TDb extends TransactionalDb> {
  /** Connection string for the RLS-restricted app role (apps: `DATABASE_URL`). */
  appUrl: string;
  /**
   * Connection string for the privileged role used for cross-org backoffice
   * work (cadra-web: `INTERNAL_API_DATABASE_URL`). Optional: without it
   * `withPrivilegedDb` throws.
   */
  privilegedUrl?: string | null;
  /**
   * Build a driver client. Pool sizes stay app-owned here (cadra-web defaults:
   * app max 10, privileged max 5 in production).
   */
  connect(url: string, role: DbClientRole): TDb;
  /**
   * The single RLS context setter. Pass `setRlsContext` from
   * `@jetdevs/core/rls`. Must set transaction-local values.
   */
  setRlsContext(tx: TxOf<TDb>, context: RlsContextValues): Promise<void>;
  /**
   * Mark a transaction as superuser for policies that honour it. Defaults to
   * transaction-local `set_config('app.is_superuser', 'true', true)`.
   */
  setSuperuserFlag?(tx: TxOf<TDb>): Promise<void>;
  /** Audit sink for privileged access. Defaults to `console.info`. */
  onPrivilegedAccess?(event: PrivilegedAccessEvent): void;
  /**
   * Cache the clients on `globalThis` under this key so Next.js dev reloads do
   * not leak pools (the app copies used `global.__db`). Omit to disable.
   */
  globalCacheKey?: string;
}

export interface DbWithRlsOptions {
  /** Sets `rls.current_user_id` too (visibility-aware policies). */
  userId?: number;
  /**
   * Also set the superuser flag. Only pass `true` from a server-owned fact
   * (a live `isSystemRole` row), never from a token or request field.
   */
  superuser?: boolean;
}

export interface DbClients<TDb extends TransactionalDb> {
  /** RLS-restricted client. Queries on it see no org unless run via `dbWithRLS`. */
  readonly db: TDb;
  /** Privileged client, or null when `privilegedUrl` is not configured. */
  readonly privilegedDb: TDb | null;
  isPrivilegedDbAvailable(): boolean;
  /** Run `fn` in one transaction with the org (and optional user) context set. */
  dbWithRLS<T>(orgId: number, fn: (tx: TxOf<TDb>) => Promise<T>, options?: DbWithRlsOptions): Promise<T>;
  /**
   * Run `fn` on the privileged client in one transaction with the superuser
   * flag set. Cross-org backoffice only; `reason` is required and reported.
   */
  withPrivilegedDb<T>(reason: string, fn: (tx: TxOf<TDb>) => Promise<T>): Promise<T>;
}

// =============================================================================
// HELPERS
// =============================================================================

interface CachedClients<TDb> {
  db?: TDb;
  privilegedDb?: TDb | null;
}

function cacheSlot<TDb>(key: string | undefined): CachedClients<TDb> {
  if (!key) return {};
  const store = globalThis as unknown as Record<symbol, CachedClients<TDb> | undefined>;
  const sym = Symbol.for(`@jetdevs/framework/db-clients:${key}`);
  const existing = store[sym];
  if (existing) return existing;
  const slot: CachedClients<TDb> = {};
  store[sym] = slot;
  return slot;
}

/** True for a positive safe integer (org and user ids). */
export function isValidRlsId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function defaultSetSuperuserFlag(tx: SqlExecutor): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.is_superuser', 'true', true)`);
}

function defaultOnPrivilegedAccess(event: PrivilegedAccessEvent): void {
  console.info('[withPrivilegedDb]', { reason: event.reason, at: event.at.toISOString() });
}

// =============================================================================
// FACTORY
// =============================================================================

export function createDbClients<TDb extends TransactionalDb>(
  options: CreateDbClientsOptions<TDb>
): DbClients<TDb> {
  const {
    appUrl,
    privilegedUrl,
    connect,
    setRlsContext,
    setSuperuserFlag,
    onPrivilegedAccess = defaultOnPrivilegedAccess,
    globalCacheKey,
  } = options;

  if (!appUrl) {
    throw new Error('createDbClients: appUrl is required');
  }

  const slot = cacheSlot<TDb>(globalCacheKey);

  const getDb = (): TDb => {
    if (slot.db === undefined) slot.db = connect(appUrl, 'app');
    return slot.db;
  };

  const getPrivilegedDb = (): TDb | null => {
    if (slot.privilegedDb === undefined) {
      slot.privilegedDb = privilegedUrl ? connect(privilegedUrl, 'privileged') : null;
    }
    return slot.privilegedDb;
  };

  const markSuperuser = async (tx: TxOf<TDb>): Promise<void> => {
    if (setSuperuserFlag) {
      await setSuperuserFlag(tx);
    } else {
      await defaultSetSuperuserFlag(tx as unknown as SqlExecutor);
    }
  };

  const runInTx = <T>(client: TDb, fn: (tx: TxOf<TDb>) => Promise<T>): Promise<T> =>
    (client as unknown as { transaction(cb: (tx: TxOf<TDb>) => Promise<T>): Promise<T> }).transaction(fn);

  return {
    get db(): TDb {
      return getDb();
    },
    get privilegedDb(): TDb | null {
      return getPrivilegedDb();
    },
    isPrivilegedDbAvailable(): boolean {
      return getPrivilegedDb() !== null;
    },
    async dbWithRLS<T>(
      orgId: number,
      fn: (tx: TxOf<TDb>) => Promise<T>,
      rlsOptions: DbWithRlsOptions = {}
    ): Promise<T> {
      if (!isValidRlsId(orgId)) {
        throw new Error('dbWithRLS: orgId must be a positive integer');
      }
      const { userId, superuser = false } = rlsOptions;
      if (userId !== undefined && !isValidRlsId(userId)) {
        throw new Error('dbWithRLS: userId must be a positive integer');
      }
      return runInTx(getDb(), async (tx: TxOf<TDb>): Promise<T> => {
        // Errors propagate: the transaction rolls back and fn never runs.
        await setRlsContext(tx, userId === undefined ? { orgId } : { orgId, userId });
        if (superuser === true) {
          await markSuperuser(tx);
        }
        return fn(tx);
      });
    },
    async withPrivilegedDb<T>(reason: string, fn: (tx: TxOf<TDb>) => Promise<T>): Promise<T> {
      if (typeof reason !== 'string' || reason.trim().length === 0) {
        throw new Error('withPrivilegedDb: a reason is required');
      }
      const pdb = getPrivilegedDb();
      if (pdb === null) {
        throw new Error('withPrivilegedDb: privileged database client is not configured (privilegedUrl)');
      }
      onPrivilegedAccess({ reason: reason.trim(), at: new Date() });
      return runInTx(pdb, async (tx: TxOf<TDb>): Promise<T> => {
        await markSuperuser(tx);
        return fn(tx);
      });
    },
  };
}
