/**
 * p77 STORY-036 — the SDK's credential writers and mints (specs.md §7.6 core-sdk
 * row; feedback P77-21), by grep over the working tree of core/src and
 * connect/src with the shared scanner (inventory-scanner.ts — identical in every
 * p77 app): every hit classified here, every entry still matched, and a
 * synthetic fixture fails naming each writer / mint.
 *
 * The runtime half for the SDK — with a refusing gate every writer below is
 * refused before it hashes, with an admitting one the gate runs first and the
 * transaction carries the three timeouts and the commit deadline — is
 * STORY-001's src/modules/auth/__tests__ credential-write suite; each app's
 * inventory test then drives these seams with the real maintenance switch.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURE_FILE, FIXTURE_SOURCE, describeHits, scanSource, scanTree, unlistedHits, unusedEntries, type AllowEntry } from './inventory-scanner';

const SDK_ROOT = path.resolve(__dirname, '../../../..');
const SEAM = 'inside withCredentialWrite (credentialWriteGate first; STORY-001)';

export const ALLOWLIST: AllowEntry[] = [
  { kind: 'writer', file: 'core/src/modules/auth/router-config.ts', contains: 'const hashedPassword = await deps.hashPassword(input.password, 12);', role: 'sdk-seam', why: `auth register — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/auth/router-config.ts', contains: 'password: hashedPassword,', role: 'sdk-seam', why: 'its insert' },
  { kind: 'writer', file: 'core/src/modules/password-reset/service.ts', contains: 'const hashedPassword = await hashPassword(password);', role: 'sdk-seam', why: `reset consume — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/password-reset/service.ts', contains: '.set({ password: hashedPassword, updatedAt: at })', role: 'sdk-seam', why: 'its UPDATE' },
  { kind: 'writer', file: 'core/src/modules/users/repository.ts', contains: 'updatePassword(db: any, userId: number, hashedPassword: string)', role: 'sdk-seam', why: 'the repository interface' },
  { kind: 'writer', file: 'core/src/modules/users/repository.ts', contains: 'async updatePassword(db: PostgresJsDatabase<any>, userId: number, hashedPassword: string)', role: 'sdk-seam', why: 'the repository write — called only on the seam transaction' },
  { kind: 'set-block', file: 'core/src/modules/users/repository.ts', contains: '.set({', role: 'sdk-seam', why: 'its UPDATE (multi-line .set)' },
  { kind: 'writer', file: 'core/src/modules/users/repository.ts', contains: 'password: hashedPassword,', role: 'sdk-seam', why: 'its UPDATE' },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'const hashedPassword = input.password', role: 'sdk-seam', why: `users create / invite — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: '? await deps.hashPassword(input.password, 10)', role: 'sdk-seam', why: 'their hashes' },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'password: hashedPassword,', role: 'sdk-seam', why: 'their inserts' },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'if (hashedPassword) {', role: 'sdk-seam', why: 'the credential-written announcement' },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'finalUpdateData.password = await deps.hashPassword(password, 10);', role: 'sdk-seam', why: `users update with a password — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'const hashedPassword = await deps.hashPassword(input.newPassword, 10);', role: 'sdk-seam', why: `users changePassword — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: 'await repo.updatePassword(tx, userId, hashedPassword);', role: 'sdk-seam', why: 'its write, on the seam tx' },
  { kind: 'writer', file: 'core/src/modules/users/router-config.ts', contains: "'Example: createUserRouterConfig({ hashPassword: (p) => bcrypt.hash(p, 10)", role: 'non-credential', why: 'an error-message example string' },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'const hashedPassword = params.password', role: 'sdk-seam', why: `service create / invite — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: '? await hooks.hashPassword(params.password, 12)', role: 'sdk-seam', why: 'its hash' },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'password: hashedPassword,', role: 'sdk-seam', why: 'its insert / update' },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'if (hashedPassword) {', role: 'sdk-seam', why: 'the announcement' },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'const hashedPassword = await hooks.hashPassword(password, 12);', role: 'sdk-seam', why: `service update with a password — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'const hashedPassword = await hooks.hashPassword(newPassword, 12);', role: 'sdk-seam', why: `service changePassword — ${SEAM}` },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: 'const result = await getRepo(tx).updatePassword(tx, userId, hashedPassword);', role: 'sdk-seam', why: 'its write, on the seam tx' },
  { kind: 'writer', file: 'core/src/modules/users/service.ts', contains: "'Example: createUserService({ hooks: { hashPassword: (p) => bcrypt.hash(p, 12)", role: 'non-credential', why: 'an error-message example string' },
  { kind: 'writer', file: 'connect/src/server/provisioning.ts', contains: 'setCredentialAndLoginRole(args: { sub: string; password?: string; orgId?: number }) {', role: 'gated', why: "the provisioning client's credentials/set call — the IdP answers 503 maintenance while the switch is on (STORY-010/f); each app's caller asks the switch first" },
];

describe('p77 §7.6 — @jetdevs/core + @jetdevs/connect writer / mint inventory (static)', () => {
  const hits = scanTree(SDK_ROOT, ['core/src', 'connect/src']);

  it('AC14: every hit of the greps over core/src and connect/src is in the allowlist', () => {
    const unlisted = unlistedHits(hits, ALLOWLIST);
    expect(unlisted, `unclassified writers/mints:\n${describeHits(unlisted)}`).toEqual([]);
  });

  it('every allowlist entry still matches a hit', () => {
    expect(unusedEntries(hits, ALLOWLIST)).toEqual([]);
  });

  it('the SDK itself signs no session: no mint hit in core or connect', () => {
    expect(hits.filter((h) => h.kind === 'mint')).toEqual([]);
  });

  it('AC14 / AC17: a fixture with a hash, a sign, clears, a multi-line .set, provisioning and mints fails naming every one', () => {
    const unlisted = unlistedHits([...hits, ...scanSource(FIXTURE_FILE, FIXTURE_SOURCE)], ALLOWLIST);
    expect(unlisted.map((h) => `${h.kind}:${h.line}`)).toEqual(['writer:2', 'mint:3', 'writer:4', 'set-block:5', 'writer:9', 'mint:10', 'mint:11', 'writer:12']);
  });
});
