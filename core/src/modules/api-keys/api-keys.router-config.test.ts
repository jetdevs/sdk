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
      roles: [{ id: 7, permissions: [{ slug: 'agents:read' }, { slug: 'agents:execute' }] }],
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
