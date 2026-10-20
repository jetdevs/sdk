/**
 * p107 ACC-001 review — access admin router config validation (pure, no DB).
 * The system-user refusal on real rows lives in `access.db.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { createAccessRouterConfig, RECOMMENDED_ACCESS_PERMISSIONS, type AccessRouterPermissions } from './router-config';
import { createAccessService } from './service';

const base = {
  service: createAccessService({ app: 'cadra' }),
  accessLink: (t: string) => `https://connect.test/waitlist/access?token=${t}`,
  sendAccessLink: async () => {},
};

describe('createAccessRouterConfig — permission slugs', () => {
  it('accepts the recommended admin:access:* slugs on every route', () => {
    const cfg = createAccessRouterConfig({ ...base, permissions: RECOMMENDED_ACCESS_PERMISSIONS });
    const slugs = Object.values(cfg).flatMap((g) => Object.values(g).map((r) => (r as { permission: string }).permission));
    expect(slugs).toHaveLength(10);
    for (const slug of slugs) expect(slug).toMatch(/^admin:access:(codes|waitlist|settings)$/);
  });

  it.each(['codeRead', 'codeCreate', 'codeRevoke', 'waitlistRead', 'waitlistDecide', 'settingsUpdate', 'settingsRead'] as const)(
    'throws at config time when %s is empty',
    (key) => {
      const permissions = { ...RECOMMENDED_ACCESS_PERMISSIONS, [key]: '  ' } as AccessRouterPermissions;
      expect(() => createAccessRouterConfig({ ...base, permissions })).toThrow(new RegExp(key));
    },
  );

  it('throws when a required slug is missing', () => {
    const { codeRevoke: _omit, ...rest } = RECOMMENDED_ACCESS_PERMISSIONS;
    expect(() =>
      createAccessRouterConfig({ ...base, permissions: rest as unknown as AccessRouterPermissions }),
    ).toThrow(/codeRevoke/);
  });

  it('refuses a non-system actor before touching the db', async () => {
    const cfg = createAccessRouterConfig({ ...base, permissions: RECOMMENDED_ACCESS_PERMISSIONS });
    const db = new Proxy({}, { get: () => { throw new Error('db touched'); } });
    await expect(
      cfg.settings.get.handler({ input: undefined, actor: { isSystemUser: false }, db } as never),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
