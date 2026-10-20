/**
 * p131 INV-002 — `@jetdevs/core/invites` and `@jetdevs/core/invites/ui` resolve
 * from dist through the package `exports` map. Self-skips until `pnpm build`
 * has emitted dist (run after `pnpm build:core`).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const built = existsSync(join(root, 'dist/invites/index.js'));

describe.skipIf(!built)('invites package exports (dist)', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    exports: Record<string, { types: string; import: string }>;
  };

  it.each(['./invites', './invites/ui'])('%s is mapped and its files exist', (sub) => {
    const e = pkg.exports[sub];
    expect(e).toBeTruthy();
    expect(existsSync(join(root, e!.import))).toBe(true);
    expect(existsSync(join(root, e!.types))).toBe(true);
  });

  it('server entry exports the handlers + service; ui entry is a client module', async () => {
    const inv = await import(pathToFileURL(join(root, pkg.exports['./invites']!.import)).href);
    for (const k of ['createInviteHandlers', 'createInviteService', 'createDrizzleInviteStore', 'inviteTablesDdl']) {
      expect(typeof inv[k]).toBe('function');
    }
    const uiFile = join(root, pkg.exports['./invites/ui']!.import);
    expect(readFileSync(uiFile, 'utf8').startsWith('"use client"')).toBe(true);
    const ui = await import(pathToFileURL(uiFile).href);
    expect(typeof ui.InviteAcceptView).toBe('function');
  });
});
