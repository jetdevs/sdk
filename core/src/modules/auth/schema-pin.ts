/**
 * Boot-time schema pin — does this database's `users` table carry the three
 * Connect columns the SDK's `users` schema selects? (p77 specs.md §5.1, §5.5)
 *
 * WHY: `@jetdevs/core` ≥ 0.1.40-dev selects `connect_issuer`,
 * `credential_authority` and `credential_version` on every `users` read. An
 * app whose database has not yet had M1 applied fails EVERY `users` read after
 * a pin bump or a local `link:` rebuild — and the failure surfaces as a
 * generic 500 far from its cause. Every RP calls this once at boot so the log
 * names the cause first (the cadra-auth `p79-sdk-schema-pin.test.ts` lesson).
 *
 * The contract:
 *
 * - Reads `information_schema.columns` for the `users` table in the
 *   connection's `current_schema()` (or `options.schema`). Writes nothing.
 * - Logs `[connect schema-pin] ok` when all three are present, else
 *   `[connect schema-pin] WARNING schema_behind: <missing, comma-separated>`.
 * - NEVER throws — a warning, not a crash (§5.5). A failed probe (no
 *   connection, no permission) logs `WARNING schema_pin_unavailable` and
 *   returns `{ ok: false, missing: [], error }`.
 */

import { sql } from 'drizzle-orm';

/** The p79 columns every `users` read selects (`db/schema/orgs.ts`). */
export const CONNECT_USERS_COLUMNS = ['connect_issuer', 'credential_authority', 'credential_version'] as const;

export type ConnectUsersColumn = (typeof CONNECT_USERS_COLUMNS)[number];

export interface SchemaPinResult {
  ok: boolean;
  /** Columns the SDK selects that the table lacks. Empty when ok or when the probe failed. */
  missing: ConnectUsersColumn[];
  /** Present only when the probe itself failed. */
  error?: unknown;
}

export interface SchemaPinOptions {
  /** Schema that holds `users`. Default: the connection's `current_schema()`. */
  schema?: string;
  logger?: Pick<Console, 'info' | 'warn'>;
}

/** `db.execute` returns an array (postgres-js) or `{ rows }` (node-postgres). */
function rowsOf(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (result && Array.isArray(result.rows)) return result.rows;
  return [];
}

export async function assertUsersSchemaCarriesConnectColumns(
  db: any,
  options: SchemaPinOptions = {},
): Promise<SchemaPinResult> {
  const logger = options.logger ?? console;
  try {
    const schemaExpr = options.schema ? sql`${options.schema}` : sql`current_schema()`;
    const result = await db.execute(sql`
      select column_name
        from information_schema.columns
       where table_schema = ${schemaExpr}
         and table_name = 'users'
         and column_name in ('connect_issuer', 'credential_authority', 'credential_version')`);
    const present = new Set(rowsOf(result).map((r: any) => String(r.column_name)));
    const missing = CONNECT_USERS_COLUMNS.filter((c) => !present.has(c));
    if (missing.length === 0) {
      logger.info('[connect schema-pin] ok');
      return { ok: true, missing: [] };
    }
    logger.warn(`[connect schema-pin] WARNING schema_behind: ${missing.join(', ')}`);
    return { ok: false, missing };
  } catch (error) {
    logger.warn(
      `[connect schema-pin] WARNING schema_pin_unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ok: false, missing: [], error };
  }
}
