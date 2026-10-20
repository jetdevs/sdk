/**
 * The single DDL source for `org_invites` (p131 INV-001, implementation.md P1/P13).
 *
 * Idempotent (`IF NOT EXISTS` throughout) — IdP migrations auto-apply on
 * every deploy. Names are unqualified (resolved by `search_path`) so IdPs paste
 * the output into a hand-written migration and tests apply it to a scratch
 * schema. Requires `orgs(id)` and `users(id)`. Must match `../schema.ts`.
 *
 * `source_system` is stored per P21 (derived from the authenticated key).
 * `users.email_verified_at` (P2) lives here only so the IdP migration can copy
 * it — it is NOT part of the shared `@jetdevs/core` users schema.
 */
export function inviteTablesDdl(): string {
  return `
CREATE TABLE IF NOT EXISTS org_invites (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email varchar(320) NOT NULL,
  role_ref varchar(64) NOT NULL,
  role_name varchar(128) NOT NULL,
  invited_by_sub varchar(255) NOT NULL,
  invited_by_name varchar(255),
  client_id varchar(255) NOT NULL,
  source_system varchar(64) NOT NULL,
  app_url text NOT NULL,
  token_hash char(64) NOT NULL CONSTRAINT org_invites_token_hash_key UNIQUE,
  access_code_id integer,
  status varchar(16) NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_user_id integer,
  cancelled_at timestamptz,
  provision_state varchar(16) NOT NULL DEFAULT 'none',
  provision_attempts integer NOT NULL DEFAULT 0,
  CONSTRAINT org_invites_status_chk CHECK (status IN ('pending','accepted','cancelled','expired'))
);
CREATE UNIQUE INDEX IF NOT EXISTS org_invites_one_open_per_email ON org_invites (org_id, email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS org_invites_org_status_idx ON org_invites (org_id, status);
`.trim();
}

/** P2: the Connect-only verified-email column. IdP migrations append this. */
export function usersEmailVerifiedAtDdl(): string {
  return `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;`;
}
