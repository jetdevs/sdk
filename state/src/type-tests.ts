/**
 * Type-level test cases. NOT executed by vitest. Compiled by
 * `pnpm typecheck` (which uses tsconfig.types.json) so the
 * `@ts-expect-error` directives below act as a regression gate on the
 * exhaustiveness / literal-narrowing guarantees.
 *
 * If any `@ts-expect-error` here stops firing, the build will fail with
 * "Unused '@ts-expect-error' directive." That is the gate.
 */
import { defineStateMachine } from './state-machine';
import type { StateMachineConfig } from './types';

// ── Positive control ──────────────────────────────────────────────────────
// Must compile cleanly with full literal narrowing.
const ok = defineStateMachine({
  states: ['draft', 'review', 'published', 'archived'],
  initial: 'draft',
  terminal: ['archived'],
  transitions: {
    draft: ['review', 'archived'],
    review: ['draft', 'published', 'archived'],
    published: ['archived'],
    archived: ['draft'],
  },
});

// canTransition narrows to the literal union — passing a literal works:
ok.canTransition('draft', 'review');

// ── Negative case 1: missing state in `transitions` ───────────────────────
defineStateMachine({
  states: ['draft', 'review', 'published', 'archived'],
  initial: 'draft',
  terminal: ['archived'],
  // @ts-expect-error — `archived` is missing from `transitions`
  transitions: {
    draft: ['review', 'archived'],
    review: ['draft', 'published', 'archived'],
    published: ['archived'],
  },
});

// ── Negative case 2: typo in a state name inside a transitions array ──────
// Use a fixed StateMachineConfig type so S cannot widen to absorb the typo.
const _typoConfig: StateMachineConfig<'draft' | 'review' | 'published'> = {
  states: ['draft', 'review', 'published'],
  initial: 'draft',
  terminal: [],
  transitions: {
    // @ts-expect-error — "reveiw" is not assignable to "draft" | "review" | "published"
    draft: ['reveiw'],
    review: ['published'],
    published: [],
  },
};
void _typoConfig;

// ── Negative case 3: canTransition called with a non-S string ─────────────
// @ts-expect-error — "nonexistent" is not in the literal union
ok.canTransition('nonexistent', 'draft');
