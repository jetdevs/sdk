/**
 * Credential authority — the one vocabulary every relying party shares for
 * "who verifies this row's password right now" (p77 specs.md §5.1, §6.1–§6.2).
 *
 * WHY it lives in the SDK: four apps (yobo, crm, commerce, superhost) move
 * their `users.credential_authority` column through the same handoff, and a
 * transition that one app allows and another refuses is exactly the split
 * brain invariant I6 ("one owner per credential at all times") forbids. The
 * states and the legal moves are therefore defined once, here, and each app's
 * database trigger (M2) and handoff driver read from this table.
 *
 * The contract:
 *
 * - `local`    — the RP verifies and writes the password.
 * - `prepared` — handoff started; the RP still verifies and writes (a change
 *                re-stages).
 * - `fenced`   — writers closed; existing sessions only, no new local session.
 * - `connect`  — Yobo Connect owns the credential. TERMINAL (D8): authority
 *                never travels backwards.
 *
 * Legal transitions (§6.2 collapsed onto the persisted column — `failed` and
 * `activated` are handoff-row states, not authority values):
 *
 *   local → prepared           prepare
 *   prepared → fenced          fence
 *   prepared → local           release (Connect's fail purged the staged row)
 *   fenced → connect           activate + flipToConnect
 *   fenced → local             release after a Connect-ordered fail
 *
 * Nothing else is legal, including every self-transition: an idempotent
 * re-activation is answered `already_activated` by the driver and never
 * writes the column.
 */

export const CREDENTIAL_AUTHORITY = ['local', 'prepared', 'fenced', 'connect'] as const;

export type CredentialAuthority = (typeof CREDENTIAL_AUTHORITY)[number];

/** For each state, the states it may move to. `connect` moves nowhere. */
export const AUTHORITY_TRANSITIONS: Readonly<Record<CredentialAuthority, readonly CredentialAuthority[]>> =
  Object.freeze({
    local: Object.freeze(['prepared'] as const),
    prepared: Object.freeze(['fenced', 'local'] as const),
    fenced: Object.freeze(['connect', 'local'] as const),
    connect: Object.freeze([] as const),
  });

/** True for a string that is one of the four authority states. */
export function isCredentialAuthority(value: unknown): value is CredentialAuthority {
  return typeof value === 'string' && (CREDENTIAL_AUTHORITY as readonly string[]).includes(value);
}

/** True when no transition leaves `state` — today only `connect` (D8). */
export function isTerminalAuthority(state: CredentialAuthority): boolean {
  return AUTHORITY_TRANSITIONS[state].length === 0;
}

/**
 * Whether `from → to` is one of the §6.2 transitions. Unknown values on either
 * side are never a legal move, so a caller that reads a corrupted column fails
 * closed.
 */
export function canTransition(from: unknown, to: unknown): boolean {
  if (!isCredentialAuthority(from) || !isCredentialAuthority(to)) return false;
  return AUTHORITY_TRANSITIONS[from].includes(to);
}
