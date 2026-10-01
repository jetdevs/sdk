/**
 * Org-membership router — accepting an invitation (YMS-292).
 *
 * `accept` is called by a user who is not yet a member of the org in the
 * input, so the router factory would refuse it like any other foreign org.
 * The route declares that its handler does the check, and the handler acts
 * only on the caller's own invitation row.
 */
import { describe, expect, it } from 'vitest';

import { createOrgMembershipRouterConfig } from './router-config';

function build(invitation: unknown) {
  const calls: string[] = [];
  class Repo {
    constructor(public db: any) {}
    async findByUserAndOrg(_db: any, userId: number, orgId: number) {
      calls.push(`findByUserAndOrg:${userId}:${orgId}`);
      return invitation;
    }
    async accept(_db: any, userId: number, orgId: number) {
      calls.push(`accept:${userId}:${orgId}`);
      return { userId, orgId, status: 'active' };
    }
  }
  const cfg: any = createOrgMembershipRouterConfig({ Repository: Repo as any } as any);
  const ctx = {
    input: { orgId: 2 },
    service: { db: {}, orgId: 2, userId: '7' },
    actor: { userId: 7, orgId: 1, isSystemUser: false },
    db: {},
    repo: new Repo({}),
    ctx: {},
  } as any;
  return { cfg, calls, ctx };
}

describe('org-membership router — accept (YMS-292)', () => {
  it('tells the router factory that the handler checks the named org', () => {
    expect(build(null).cfg.accept.inputOrgCheckedByHandler).toBe(true);
  });

  it('is the only route in this router that takes over the org check', () => {
    const { cfg } = build(null);
    const optedIn = Object.keys(cfg).filter((name) => cfg[name].inputOrgCheckedByHandler);
    expect(optedIn).toEqual(['accept']);
  });

  it('stops when the caller has no invitation in the named org', async () => {
    const { cfg, calls, ctx } = build(null);
    await expect(cfg.accept.handler(ctx)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls).toEqual(['findByUserAndOrg:7:2']);
  });

  it('accepts the caller’s own invitation', async () => {
    const { cfg, calls, ctx } = build({ userId: 7, orgId: 2, pendingRoleId: null });
    await expect(cfg.accept.handler(ctx)).resolves.toMatchObject({ member: { userId: 7, orgId: 2 } });
    expect(calls).toEqual(['findByUserAndOrg:7:2', 'accept:7:2']);
  });
});
