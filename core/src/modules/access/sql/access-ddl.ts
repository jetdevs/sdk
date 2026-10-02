/**
 * The single DDL source for the access tables (p107 ACC-001).
 *
 * Idempotent: every statement is `IF NOT EXISTS`; inline CHECKs ride with
 * `CREATE TABLE IF NOT EXISTS`. Names are unqualified (resolved by
 * `search_path`), so apps paste the output into a hand-written migration
 * (`drizzle-kit generate` is not used) and tests apply it to a scratch schema.
 * Requires a `users(id)` table. Must match `../schema.ts`.
 */
export function accessTablesDdl(): string {
  return `
CREATE TABLE IF NOT EXISTS access_codes (
  id serial PRIMARY KEY,
  code varchar(32) NOT NULL,
  kind varchar(16) NOT NULL CONSTRAINT access_codes_kind_chk CHECK (kind IN ('personal','campaign','single_use')),
  owner_user_id integer REFERENCES users(id) ON DELETE CASCADE,
  app varchar(64) NOT NULL,
  max_uses integer CONSTRAINT access_codes_max_uses_chk CHECK (max_uses IS NULL OR max_uses >= 0),
  uses integer NOT NULL DEFAULT 0 CONSTRAINT access_codes_uses_chk CHECK (uses >= 0),
  expires_at timestamptz,
  tag varchar(128),
  grants_access boolean NOT NULL DEFAULT true,
  bound_email varchar(255),
  status varchar(16) NOT NULL DEFAULT 'active' CONSTRAINT access_codes_status_chk CHECK (status IN ('active','revoked')),
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_code_upper_idx ON access_codes (upper(code));
CREATE UNIQUE INDEX IF NOT EXISTS access_codes_personal_owner_idx ON access_codes (owner_user_id, app) WHERE kind = 'personal';
CREATE INDEX IF NOT EXISTS access_codes_app_idx ON access_codes (app);
CREATE INDEX IF NOT EXISTS access_codes_bound_email_idx ON access_codes (lower(bound_email)) WHERE bound_email IS NOT NULL;

CREATE TABLE IF NOT EXISTS access_redemptions (
  id serial PRIMARY KEY,
  code_id integer NOT NULL REFERENCES access_codes(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app varchar(64) NOT NULL,
  source varchar(8) NOT NULL CONSTRAINT access_redemptions_source_chk CHECK (source IN ('link','typed')),
  first_touch_at timestamptz,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS access_redemptions_code_user_idx ON access_redemptions (code_id, user_id);
CREATE INDEX IF NOT EXISTS access_redemptions_user_idx ON access_redemptions (user_id);

CREATE TABLE IF NOT EXISTS waitlist_entries (
  id serial PRIMARY KEY,
  app varchar(64) NOT NULL,
  email varchar(255) NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  state varchar(16) NOT NULL DEFAULT 'pending' CONSTRAINT waitlist_entries_state_chk CHECK (state IN ('pending','approved','rejected','signed_up')),
  source_code_id integer REFERENCES access_codes(id) ON DELETE SET NULL,
  access_token_hash varchar(64),
  expires_at timestamptz,
  resend_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by integer REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  user_id integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_pending_email_idx ON waitlist_entries (app, lower(email)) WHERE state = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_token_hash_idx ON waitlist_entries (access_token_hash) WHERE access_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS waitlist_entries_app_state_idx ON waitlist_entries (app, state);

CREATE TABLE IF NOT EXISTS app_access_settings (
  app varchar(64) PRIMARY KEY,
  mode varchar(16) NOT NULL DEFAULT 'off' CONSTRAINT app_access_settings_mode_chk CHECK (mode IN ('off','optional','required')),
  personal_code_default_cap integer NOT NULL DEFAULT 10 CONSTRAINT app_access_settings_cap_chk CHECK (personal_code_default_cap >= 0),
  waitlist_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  copy jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`.trim();
}
