import { describe, expect, it } from 'vitest';
import { defineStateMachine } from './state-machine';
import type { StateMachineConfig, WriteResult } from './types';

// ── Fixtures ───────────────────────────────────────────────────────────────

type WidgetStatus = 'draft' | 'review' | 'published' | 'archived';
type Ctx = { id: number; reason?: string; actor?: number };

const baseConfig: StateMachineConfig<WidgetStatus, Ctx> = {
  states: ['draft', 'review', 'published', 'archived'],
  initial: 'draft',
  terminal: ['archived'],
  transitions: {
    draft: ['review', 'archived'],
    review: ['draft', 'published', 'archived'],
    published: ['archived'],
    archived: ['draft'],
  },
};

const okWrite =
  <R>(row: R) =>
  async (): Promise<WriteResult<R>> => ({ ok: true, row });

const noopWrite = async (): Promise<WriteResult<unknown>> => ({ ok: false });

// ── Pure reads ─────────────────────────────────────────────────────────────

describe('pure reads', () => {
  const sm = defineStateMachine(baseConfig);

  it('canTransition true for legal edges', () => {
    expect(sm.canTransition('draft', 'review')).toBe(true);
    expect(sm.canTransition('review', 'published')).toBe(true);
    expect(sm.canTransition('published', 'archived')).toBe(true);
    expect(sm.canTransition('archived', 'draft')).toBe(true);
  });

  it('canTransition false for illegal edges', () => {
    expect(sm.canTransition('draft', 'published')).toBe(false);
    expect(sm.canTransition('published', 'draft')).toBe(false);
    expect(sm.canTransition('archived', 'review')).toBe(false);
  });

  it('validTransitionsFrom returns the configured array', () => {
    expect([...sm.validTransitionsFrom('review')].sort()).toEqual(
      ['archived', 'draft', 'published'].sort(),
    );
    expect(sm.validTransitionsFrom('published')).toEqual(['archived']);
  });

  it('isTerminal true only for terminal states', () => {
    expect(sm.isTerminal('archived')).toBe(true);
    expect(sm.isTerminal('draft')).toBe(false);
    expect(sm.isTerminal('review')).toBe(false);
    expect(sm.isTerminal('published')).toBe(false);
  });

  it('isInitial true only for the initial state', () => {
    expect(sm.isInitial('draft')).toBe(true);
    expect(sm.isInitial('review')).toBe(false);
  });

  it('exposes states/terminal/initial', () => {
    expect(sm.states).toEqual(baseConfig.states);
    expect(sm.terminal).toEqual(baseConfig.terminal);
    expect(sm.initial).toBe('draft');
  });
});

// ── Pipeline ordering: happy path ──────────────────────────────────────────

describe('execute pipeline ordering', () => {
  it('runs guard → onExit → write → onEnter → log in order', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      guards: {
        'draft->review': () => {
          calls.push('guard');
          return true;
        },
      },
      onExit: {
        draft: () => {
          calls.push('onExit');
        },
      },
      onEnter: {
        review: () => {
          calls.push('onEnter');
        },
      },
    });

    const result = await sm.execute({
      from: 'draft',
      to: 'review',
      ctx: { id: 1 },
      write: async (to) => {
        calls.push('write');
        return { ok: true, row: { id: 1, status: to } };
      },
      log: async () => {
        calls.push('log');
      },
    });

    expect(calls).toEqual(['guard', 'onExit', 'write', 'onEnter', 'log']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row).toEqual({ id: 1, status: 'review' });
      expect(result.from).toBe('draft');
      expect(result.to).toBe('review');
    }
  });

  it('skips missing hooks gracefully', async () => {
    const sm = defineStateMachine(baseConfig);
    const result = await sm.execute({
      from: 'draft',
      to: 'review',
      ctx: { id: 1 },
      write: okWrite({ id: 1 }),
    });
    expect(result.ok).toBe(true);
  });
});

// ── Pipeline ordering: soft failures ───────────────────────────────────────

describe('execute soft failures', () => {
  it('invalid_transition: nothing else runs', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      guards: {
        'draft->published': () => {
          calls.push('guard');
          return true;
        },
      },
      onExit: { draft: () => void calls.push('onExit') },
      onEnter: { published: () => void calls.push('onEnter') },
    });

    const result = await sm.execute({
      from: 'draft',
      to: 'published',
      ctx: { id: 1 },
      write: async () => {
        calls.push('write');
        return { ok: true, row: 1 };
      },
      log: async () => void calls.push('log'),
    });

    expect(result).toEqual({
      ok: false,
      from: 'draft',
      to: 'published',
      reason: 'invalid_transition',
    });
    expect(calls).toEqual([]);
  });

  it('guard_failed: only guard ran', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      guards: {
        'draft->review': () => 'needs reason',
      },
      onExit: { draft: () => void calls.push('onExit') },
    });

    const result = await sm.execute({
      from: 'draft',
      to: 'review',
      ctx: { id: 1 },
      write: async () => {
        calls.push('write');
        return { ok: true, row: 1 };
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('guard_failed');
      expect(result.error).toBe('needs reason');
    }
    expect(calls).toEqual([]);
  });

  it('write_noop: onExit ran, onEnter and log did NOT', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onExit: { draft: () => void calls.push('onExit') },
      onEnter: { review: () => void calls.push('onEnter') },
    });

    const result = await sm.execute({
      from: 'draft',
      to: 'review',
      ctx: { id: 1 },
      write: noopWrite,
      log: async () => void calls.push('log'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('write_noop');
    expect(calls).toEqual(['onExit']);
  });
});

// ── Pipeline ordering: hard failures (exceptions propagate) ────────────────

describe('execute hard failures', () => {
  it('guard throws → propagates, no later hooks', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      guards: {
        'draft->review': () => {
          throw new Error('boom guard');
        },
      },
      onExit: { draft: () => void calls.push('onExit') },
    });

    await expect(
      sm.execute({
        from: 'draft',
        to: 'review',
        ctx: { id: 1 },
        write: async () => {
          calls.push('write');
          return { ok: true, row: 1 };
        },
      }),
    ).rejects.toThrow('boom guard');
    expect(calls).toEqual([]);
  });

  it('onExit throws → no write/onEnter/log', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onExit: {
        draft: () => {
          throw new Error('boom onExit');
        },
      },
      onEnter: { review: () => void calls.push('onEnter') },
    });

    await expect(
      sm.execute({
        from: 'draft',
        to: 'review',
        ctx: { id: 1 },
        write: async () => {
          calls.push('write');
          return { ok: true, row: 1 };
        },
        log: async () => void calls.push('log'),
      }),
    ).rejects.toThrow('boom onExit');
    expect(calls).toEqual([]);
  });

  it('write throws → propagates, no onEnter/log', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onEnter: { review: () => void calls.push('onEnter') },
    });

    await expect(
      sm.execute({
        from: 'draft',
        to: 'review',
        ctx: { id: 1 },
        write: async () => {
          throw new Error('boom write');
        },
        log: async () => void calls.push('log'),
      }),
    ).rejects.toThrow('boom write');
    expect(calls).toEqual([]);
  });

  it('onEnter throws → propagates after write', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onEnter: {
        review: () => {
          throw new Error('boom onEnter');
        },
      },
    });

    await expect(
      sm.execute({
        from: 'draft',
        to: 'review',
        ctx: { id: 1 },
        write: async () => {
          calls.push('write');
          return { ok: true, row: 1 };
        },
        log: async () => void calls.push('log'),
      }),
    ).rejects.toThrow('boom onEnter');
    expect(calls).toEqual(['write']);
  });

  it('log throws → propagates after write+onEnter', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onEnter: { review: () => void calls.push('onEnter') },
    });

    await expect(
      sm.execute({
        from: 'draft',
        to: 'review',
        ctx: { id: 1 },
        write: async () => {
          calls.push('write');
          return { ok: true, row: 1 };
        },
        log: async () => {
          throw new Error('boom log');
        },
      }),
    ).rejects.toThrow('boom log');
    expect(calls).toEqual(['write', 'onEnter']);
  });
});

// ── Async behavior ────────────────────────────────────────────────────────

describe('async behavior', () => {
  it('hooks may return void synchronously or Promise', async () => {
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onExit: { draft: () => undefined },
      onEnter: { review: async () => undefined },
    });
    const r = await sm.execute({
      from: 'draft',
      to: 'review',
      ctx: { id: 1 },
      write: okWrite({ id: 1 }),
    });
    expect(r.ok).toBe(true);
  });

  it('concurrent execute calls do not interfere', async () => {
    const sm = defineStateMachine(baseConfig);
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        sm.execute({
          from: 'draft',
          to: 'review',
          ctx: { id: i },
          write: okWrite({ id: i }),
        }),
      ),
    );
    for (const r of results) expect(r.ok).toBe(true);
  });
});

// ── Misuse defense ────────────────────────────────────────────────────────

describe('misuse defense (construction-time)', () => {
  it('throws on empty states', () => {
    expect(() =>
      defineStateMachine({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        states: [] as any,
        initial: 'x' as never,
        terminal: [],
        transitions: {} as never,
      }),
    ).toThrow(/non-empty/);
  });

  it('throws when initial is not in states', () => {
    expect(() =>
      defineStateMachine({
        states: ['a', 'b'] as const,
        initial: 'c' as never,
        terminal: [],
        transitions: { a: ['b'], b: ['a'] } as never,
      }),
    ).toThrow(/initial/);
  });

  it('throws when a terminal value is not in states', () => {
    expect(() =>
      defineStateMachine({
        states: ['a', 'b'] as const,
        initial: 'a',
        terminal: ['z' as never],
        transitions: { a: ['b'], b: ['a'] },
      }),
    ).toThrow(/terminal/);
  });

  it('throws when a transitions target is not in states', () => {
    expect(() =>
      defineStateMachine({
        states: ['a', 'b'] as const,
        initial: 'a',
        terminal: [],
        transitions: { a: ['z' as never], b: ['a'] },
      }),
    ).toThrow(/transitions/);
  });
});

// ── executeInitialEntry ───────────────────────────────────────────────────

describe('executeInitialEntry', () => {
  it('happy path: write → onEnter → log in order, from === to', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onExit: {
        draft: () => {
          calls.push('onExit-should-not-run');
        },
      },
      onEnter: {
        draft: () => {
          calls.push('onEnter');
        },
      },
    });

    let loggedRow: unknown;
    let loggedFrom: WidgetStatus | undefined;
    let loggedTo: WidgetStatus | undefined;
    const result = await sm.executeInitialEntry({
      to: 'draft',
      ctx: { id: 7 },
      write: async (to) => {
        calls.push('write');
        return { ok: true, row: { id: 999, status: to } };
      },
      log: async (entry) => {
        calls.push('log');
        loggedRow = entry.row;
        loggedFrom = entry.from;
        loggedTo = entry.to;
      },
    });

    expect(calls).toEqual(['write', 'onEnter', 'log']);
    expect(loggedFrom).toBe('draft');
    expect(loggedTo).toBe('draft');
    expect(loggedRow).toEqual({ id: 999, status: 'draft' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.row).toEqual({ id: 999, status: 'draft' });
  });

  it('write_noop halts: no onEnter, no log', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onEnter: { draft: () => void calls.push('onEnter') },
    });

    const result = await sm.executeInitialEntry({
      to: 'draft',
      ctx: { id: 1 },
      write: noopWrite,
      log: async () => void calls.push('log'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('write_noop');
      expect(result.from).toBe('draft');
      expect(result.to).toBe('draft');
    }
    expect(calls).toEqual([]);
  });

  it('throws synchronously when `to` is not in states', async () => {
    const sm = defineStateMachine(baseConfig);
    await expect(
      sm.executeInitialEntry({
        to: 'nope' as WidgetStatus,
        ctx: { id: 1 },
        write: okWrite({}),
      }),
    ).rejects.toThrow(/not in `states`/);
  });

  it('onEnter throws → propagates', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onEnter: {
        draft: () => {
          throw new Error('boom onEnter init');
        },
      },
    });

    await expect(
      sm.executeInitialEntry({
        to: 'draft',
        ctx: { id: 1 },
        write: async () => {
          calls.push('write');
          return { ok: true, row: 1 };
        },
        log: async () => void calls.push('log'),
      }),
    ).rejects.toThrow('boom onEnter init');
    expect(calls).toEqual(['write']);
  });

  it('log throws → propagates', async () => {
    const sm = defineStateMachine(baseConfig);
    await expect(
      sm.executeInitialEntry({
        to: 'draft',
        ctx: { id: 1 },
        write: okWrite({ id: 1 }),
        log: async () => {
          throw new Error('boom log init');
        },
      }),
    ).rejects.toThrow('boom log init');
  });

  it('does NOT call onExit (no `from` exists)', async () => {
    const calls: string[] = [];
    const sm = defineStateMachine<WidgetStatus, Ctx>({
      ...baseConfig,
      onExit: { draft: () => void calls.push('onExit') },
      onEnter: { draft: () => void calls.push('onEnter') },
    });

    await sm.executeInitialEntry({
      to: 'draft',
      ctx: { id: 1 },
      write: okWrite({ id: 1 }),
    });

    expect(calls).toEqual(['onEnter']);
  });

  it('does NOT consult transitions table (initial entry into non-initial state)', async () => {
    // archived has no incoming edge from itself, but executeInitialEntry must work.
    const sm = defineStateMachine(baseConfig);
    const result = await sm.executeInitialEntry({
      to: 'archived',
      ctx: { id: 1 },
      write: okWrite({ id: 1, status: 'archived' }),
    });
    expect(result.ok).toBe(true);
  });
});
