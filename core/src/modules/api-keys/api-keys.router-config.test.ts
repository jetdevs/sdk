/**
 * Tests for the API keys create-handler permission resolution.
 *
 * Regression target: when an app's configured default role is a system role
 * that the tenant-scoped role lookup cannot resolve (cadra-web's 'API Key'
 * role), the role fallback returns null and the key was previously persisted
 * with an empty permission array -> downstream "No permissions". The
 * `defaultPermissions` option is the safety net.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiKeysRouterConfig } from './api-keys.router-config';

// Mock the role repository so we control what the default-role lookup returns.
const listMock = vi.fn();
const getByIdMock = vi.fn();
vi.mock('../rbac/role.repository', () => ({
  SDKRoleRepository: vi.fn().mockImplementation(() => ({
    list: listMock,
    getById: getByIdMock,
  })),
}));

type CreatedValues = { permissions: string[]; roleId?: number | null };

function makeRepo() {
  const create = vi.fn(async (data: CreatedValues) => ({ id: 1, ...data }));
  return { create } as any;
}

const baseInput = {
  name: 'test key',
  permissions: [] as string[],
  environment: 'live' as const,
};

const service = { orgId: 2, userId: '1' };

describe('apiKeys create handler — permission resolution', () => {
  beforeEach(() => {
    listMock.mockReset();
    getByIdMock.mockReset();
  });

  it('applies defaultPermissions when the default-role lookup yields nothing (the cadra bug)', async () => {
    // findAdminRole -> roleRepo.list returns no roles (system role filtered out)
    listMock.mockResolvedValue({ roles: [] });
    const repo = makeRepo();

    const config = createApiKeysRouterConfig({ defaultPermissions: ['*'] });
    await config.create.handler({
      input: baseInput,
      service,
      repo,
      db: {} /* truthy so the role block runs */,
    } as any);

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create.mock.calls[0][0].permissions).toEqual(['*']);
  });

  it('persists empty permissions (legacy behavior) when no defaultPermissions configured', async () => {
    listMock.mockResolvedValue({ roles: [] });
    const repo = makeRepo();

    const config = createApiKeysRouterConfig(); // no defaultPermissions
    await config.create.handler({
      input: baseInput,
      service,
      repo,
      db: {},
    } as any);

    expect(repo.create.mock.calls[0][0].permissions).toEqual([]);
  });

  it('does NOT override permissions derived from a resolved default role', async () => {
    listMock.mockResolvedValue({
      // findRoleByName matches the name exactly; 'Full API Access' is the default.
      roles: [{ id: 7, name: 'Full API Access', permissions: [{ slug: 'agents:read' }, { slug: 'agents:execute' }] }],
    });
    const repo = makeRepo();

    const config = createApiKeysRouterConfig({ defaultPermissions: ['*'] });
    await config.create.handler({
      input: baseInput,
      service,
      repo,
      db: {},
    } as any);

    expect(repo.create.mock.calls[0][0].permissions).toEqual(['agents:read', 'agents:execute']);
  });

  it('does NOT override explicitly-provided permissions', async () => {
    const repo = makeRepo();

    const config = createApiKeysRouterConfig({ defaultPermissions: ['*'] });
    await config.create.handler({
      input: { ...baseInput, permissions: ['agents:read'] },
      service,
      repo,
      db: {},
    } as any);

    // explicit perms provided -> role lookup skipped, defaults not applied
    expect(listMock).not.toHaveBeenCalled();
    expect(repo.create.mock.calls[0][0].permissions).toEqual(['agents:read']);
  });
});

describe('apiKeys — platform permissions on a key (YMS-297)', () => {
  const orgAdmin = { isSystemUser: false, isSuperUser: false, permissions: ['api_keys:manage'] };
  const staff = { isSystemUser: true, isSuperUser: true, permissions: ['admin:full_access'] };
  const base = { name: 'k', environment: 'test' as const, permissions: [] as string[] };
  const call = (cfg: any, proc: string, input: any, actor: any) =>
    cfg[proc].handler({
      input,
      service: { orgId: 1, userId: '7' },
      actor,
      db: undefined,
      repo: makeRepo(),
      ctx: {},
    } as any);

  for (const permission of ['admin:full_access', 'admin:manage', 'org:cross_org_access', '*']) {
    it(`create refuses ${permission} listed by an org-level caller`, async () => {
      const cfg = createApiKeysRouterConfig({});
      await expect(call(cfg, 'create', { ...base, permissions: ['user:read', permission] }, orgAdmin)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  }

  it('update refuses a platform permission listed by an org-level caller', async () => {
    const cfg = createApiKeysRouterConfig({});
    await expect(call(cfg, 'update', { id: 1, permissions: ['admin:full_access'] }, orgAdmin)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('create still accepts ordinary permissions from an org-level caller', async () => {
    const cfg = createApiKeysRouterConfig({});
    await expect(call(cfg, 'create', { ...base, permissions: ['user:read'] }, orgAdmin)).resolves.toMatchObject({
      key: expect.any(String),
    });
  });

  it('create accepts a platform permission from a caller with full platform access', async () => {
    const cfg = createApiKeysRouterConfig({});
    await expect(call(cfg, 'create', { ...base, permissions: ['admin:full_access'] }, staff)).resolves.toMatchObject({
      key: expect.any(String),
    });
  });

  it('the app’s own default permissions are not the caller’s choice and still apply', async () => {
    const cfg = createApiKeysRouterConfig({ defaultPermissions: ['*'] });
    await expect(call(cfg, 'create', base, orgAdmin)).resolves.toMatchObject({ key: expect.any(String) });
  });
});
