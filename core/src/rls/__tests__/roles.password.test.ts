/**
 * Audit row 1 — app_user password is never built into the SDK.
 * getRlsRolesSql / ensureRlsRoles take it from the caller or APP_USER_DB_PASSWORD.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_USER_PASSWORD_ENV, getRlsRolesSql, RLS_ROLES_SQL } from '../policies';
import { ensureRlsRoles } from '../deploy';

const OLD_DEFAULT = 'app-user-password';

describe('getRlsRolesSql', () => {
  it('creates a missing app_user without a password when none is given', () => {
    const sql = getRlsRolesSql();
    expect(sql).toContain('CREATE ROLE app_user WITH LOGIN;');
    expect(sql).not.toMatch(/WITH LOGIN PASSWORD/);
    expect(sql).not.toContain(OLD_DEFAULT);
    expect(RLS_ROLES_SQL).toBe(sql);
  });

  it('uses the given password, escaping quotes', () => {
    const sql = getRlsRolesSql("s3cr'et");
    expect(sql).toContain("CREATE ROLE app_user WITH LOGIN PASSWORD 's3cr''et';");
  });

  it('only creates the role when missing, never alters an existing one', () => {
    const sql = getRlsRolesSql('pw');
    expect(sql).toContain("IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')");
    expect(sql).not.toMatch(/ALTER ROLE/i);
  });

  it('rejects a password containing the DO-block quote tag', () => {
    expect(() => getRlsRolesSql('a$rls_roles$b')).toThrow(APP_USER_PASSWORD_ENV);
  });
});

describe('ensureRlsRoles', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it(`reads the password from ${APP_USER_PASSWORD_ENV}`, async () => {
    vi.stubEnv(APP_USER_PASSWORD_ENV, 'from-env');
    const executed: string[] = [];
    await ensureRlsRoles(async (sql) => { executed.push(sql); });
    expect(executed[0]).toContain("PASSWORD 'from-env'");
  });

  it('creates app_user without a password when the env var is unset', async () => {
    vi.stubEnv(APP_USER_PASSWORD_ENV, '');
    const executed: string[] = [];
    await ensureRlsRoles(async (sql) => { executed.push(sql); });
    expect(executed[0]).toContain('CREATE ROLE app_user WITH LOGIN;');
    expect(executed.join('\n')).not.toContain(OLD_DEFAULT);
  });

  it('never prints the password when role creation fails', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((msg: string) => { errors.push(msg); });
    await ensureRlsRoles(async (sql) => {
      if (sql.includes('CREATE ROLE')) throw new Error(`Failed query: ${sql}`);
    }, { appUserPassword: 'top-secret' });
    expect(errors.join('\n')).toContain('Failed to create roles');
    expect(errors.join('\n')).not.toContain('top-secret');
  });
});
