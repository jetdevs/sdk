/**
 * p77 STORY-001 — the credential-authority transition table (specs.md §6.2).
 *
 * Classification: UNIT, no mocks. Every ordered pair of the four states is
 * checked against the spec's list, so a transition added or removed anywhere
 * fails here.
 */
import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_TRANSITIONS,
  CREDENTIAL_AUTHORITY,
  canTransition,
  isCredentialAuthority,
  isTerminalAuthority,
  type CredentialAuthority,
} from './credential-authority';
import * as authIndex from './index';

/** specs.md §6.2, collapsed onto the persisted column. Nothing else is legal. */
const LEGAL: ReadonlyArray<[CredentialAuthority, CredentialAuthority]> = [
  ['local', 'prepared'],
  ['prepared', 'fenced'],
  ['prepared', 'local'],
  ['fenced', 'connect'],
  ['fenced', 'local'],
];

const ALL_PAIRS = CREDENTIAL_AUTHORITY.flatMap((from) =>
  CREDENTIAL_AUTHORITY.map((to) => [from, to] as [CredentialAuthority, CredentialAuthority]),
);

describe('credential authority', () => {
  it('has exactly the four states, in order', () => {
    expect(CREDENTIAL_AUTHORITY).toEqual(['local', 'prepared', 'fenced', 'connect']);
  });

  it.each(ALL_PAIRS)('%s → %s is legal exactly when §6.2 lists it', (from, to) => {
    const expected = LEGAL.some(([f, t]) => f === from && t === to);
    expect(canTransition(from, to)).toBe(expected);
  });

  it('allows exactly 5 of the 16 ordered pairs', () => {
    expect(ALL_PAIRS.filter(([f, t]) => canTransition(f, t))).toEqual(
      ALL_PAIRS.filter(([f, t]) => LEGAL.some(([lf, lt]) => lf === f && lt === t)),
    );
    expect(ALL_PAIRS.filter(([f, t]) => canTransition(f, t))).toHaveLength(5);
  });

  it('connect is terminal and the only terminal state (D8: authority never rolls back)', () => {
    expect(isTerminalAuthority('connect')).toBe(true);
    expect(AUTHORITY_TRANSITIONS.connect).toEqual([]);
    for (const s of ['local', 'prepared', 'fenced'] as const) {
      expect(isTerminalAuthority(s)).toBe(false);
    }
    for (const to of CREDENTIAL_AUTHORITY) expect(canTransition('connect', to)).toBe(false);
  });

  it('no self-transition is legal', () => {
    for (const s of CREDENTIAL_AUTHORITY) expect(canTransition(s, s)).toBe(false);
  });

  it('unknown values fail closed on either side', () => {
    for (const bad of ['', 'LOCAL', 'failed', 'activated', null, undefined, 1]) {
      expect(isCredentialAuthority(bad)).toBe(false);
      expect(canTransition(bad, 'prepared')).toBe(false);
      expect(canTransition('local', bad)).toBe(false);
    }
  });

  it('the table is frozen', () => {
    expect(Object.isFrozen(AUTHORITY_TRANSITIONS)).toBe(true);
    expect(Object.isFrozen(AUTHORITY_TRANSITIONS.local)).toBe(true);
  });

  it('is exported from the auth entry point', () => {
    expect(authIndex.CREDENTIAL_AUTHORITY).toBe(CREDENTIAL_AUTHORITY);
    expect(authIndex.canTransition).toBe(canTransition);
    expect(authIndex.isTerminalAuthority).toBe(isTerminalAuthority);
    expect(authIndex.AUTHORITY_TRANSITIONS).toBe(AUTHORITY_TRANSITIONS);
  });
});
