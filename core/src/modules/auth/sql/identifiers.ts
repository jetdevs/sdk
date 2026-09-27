/**
 * Identifier handling for the p77 trigger SQL templates (STORY-002).
 *
 * WHY: the templates splice a table name into DDL. A value that is not a plain
 * lower-case identifier is refused here rather than quoted-and-hoped, and every
 * derived function/trigger name is checked against Postgres' 63-byte limit,
 * because Postgres TRUNCATES a longer identifier silently — two templates could
 * then collide on one function name and the later CREATE OR REPLACE would
 * overwrite the earlier one without a word.
 *
 * Contract: `sqlIdent(name)` returns the double-quoted identifier or throws.
 * Schema-qualified names are not accepted; apply the SQL with the target schema
 * on the search_path (drizzle migrations already run that way).
 */

const PLAIN_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const PG_MAX_IDENTIFIER_BYTES = 63;

/** Quote a plain lower-case identifier, refusing anything else. */
export function sqlIdent(name: string): string {
  if (typeof name !== 'string' || !PLAIN_IDENTIFIER.test(name)) {
    throw new Error(
      `p77 trigger SQL: ${JSON.stringify(name)} is not a plain lower-case identifier ([a-z_][a-z0-9_]*)`,
    );
  }
  // ASCII-only after the regex, so length === bytes.
  if (name.length > PG_MAX_IDENTIFIER_BYTES) {
    throw new Error(
      `p77 trigger SQL: identifier ${JSON.stringify(name)} exceeds ${PG_MAX_IDENTIFIER_BYTES} bytes — Postgres would truncate it silently`,
    );
  }
  return `"${name}"`;
}

/** Escape a value for a single-quoted SQL string literal. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
