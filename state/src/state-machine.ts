import type {
  GuardKey,
  StateMachine,
  StateMachineConfig,
  TransitionResult,
  WriteResult,
} from './types';

/**
 * The `const` modifier on the type parameter forces literal inference of the
 * `states` array passed by the caller, so `S` becomes a string literal union
 * rather than widening to `string`. This is what makes the
 * `TransitionTable<S>` exhaustiveness check actually fire.
 *
 * Requires TypeScript 5.0+.
 */
export function defineStateMachine<
  const S extends string,
  EvtCtx = unknown,
>(config: StateMachineConfig<S, EvtCtx>): StateMachine<S, EvtCtx> {
  // ── Misuse defense (construction-time validation) ───────────────────────
  if (!Array.isArray(config.states) || config.states.length === 0) {
    throw new Error(
      '[@jetdevs/state] defineStateMachine: `states` must be a non-empty array',
    );
  }

  const stateSet = new Set<string>(config.states as readonly string[]);

  if (!stateSet.has(config.initial as string)) {
    throw new Error(
      `[@jetdevs/state] defineStateMachine: \`initial\` ("${String(
        config.initial,
      )}") is not in \`states\``,
    );
  }

  for (const t of config.terminal) {
    if (!stateSet.has(t as string)) {
      throw new Error(
        `[@jetdevs/state] defineStateMachine: terminal state "${String(
          t,
        )}" is not in \`states\``,
      );
    }
  }

  for (const from of config.states) {
    const targets = (config.transitions as Record<string, readonly string[]>)[
      from as string
    ];
    if (targets === undefined) {
      throw new Error(
        `[@jetdevs/state] defineStateMachine: \`transitions\` is missing entry for state "${String(
          from,
        )}"`,
      );
    }
    for (const to of targets) {
      if (!stateSet.has(to)) {
        throw new Error(
          `[@jetdevs/state] defineStateMachine: transitions["${String(
            from,
          )}"] contains "${to}" which is not in \`states\``,
        );
      }
    }
  }

  const terminalSet = new Set<string>(config.terminal as readonly string[]);

  // Pre-build the edge set for O(1) canTransition.
  const edgeSet = new Set<string>();
  for (const from of config.states) {
    const targets = (config.transitions as Record<string, readonly string[]>)[
      from as string
    ];
    for (const to of targets) {
      edgeSet.add(`${from as string}->${to}`);
    }
  }

  function canTransition(from: S, to: S): boolean {
    return edgeSet.has(`${from as string}->${to as string}`);
  }

  function validTransitionsFrom(state: S): readonly S[] {
    return (
      (config.transitions as Record<string, readonly S[]>)[state as string] ??
      []
    );
  }

  function isTerminal(state: S): boolean {
    return terminalSet.has(state as string);
  }

  function isInitial(state: S): boolean {
    return state === config.initial;
  }

  async function execute<R>(args: {
    from: S;
    to: S;
    ctx: EvtCtx;
    write: (to: S) => Promise<WriteResult<R>>;
    log?: (entry: {
      from: S;
      to: S;
      ctx: EvtCtx;
      at: Date;
      row: R;
    }) => Promise<void>;
  }): Promise<TransitionResult<S, R>> {
    const { from, to, ctx, write, log } = args;

    // 1. canTransition
    if (!canTransition(from, to)) {
      return { ok: false, from, to, reason: 'invalid_transition' };
    }

    // 2. guard
    const guardKey = `${from as string}->${to as string}` as GuardKey<S>;
    const guard = config.guards?.[guardKey];
    if (guard) {
      const guardResult = guard(ctx);
      if (guardResult !== true) {
        return {
          ok: false,
          from,
          to,
          reason: 'guard_failed',
          error: guardResult,
        };
      }
    }

    // 3. onExit
    const onExit = config.onExit?.[from];
    if (onExit) {
      await onExit(ctx);
    }

    // 4. write
    const writeResult = await write(to);
    if (!writeResult.ok) {
      return { ok: false, from, to, reason: 'write_noop' };
    }

    // 5. onEnter
    const onEnter = config.onEnter?.[to];
    if (onEnter) {
      await onEnter(ctx);
    }

    // 6. log
    if (log) {
      await log({ from, to, ctx, at: new Date(), row: writeResult.row });
    }

    return { ok: true, from, to, row: writeResult.row };
  }

  async function executeInitialEntry<R>(args: {
    to: S;
    ctx: EvtCtx;
    write: (to: S) => Promise<WriteResult<R>>;
    log?: (entry: {
      from: S;
      to: S;
      ctx: EvtCtx;
      at: Date;
      row: R;
    }) => Promise<void>;
  }): Promise<TransitionResult<S, R>> {
    const { to, ctx, write, log } = args;

    // 1. validate `to` is in states (synchronous throw)
    if (!stateSet.has(to as string)) {
      throw new Error(
        `[@jetdevs/state] executeInitialEntry: state "${String(
          to,
        )}" is not in \`states\``,
      );
    }

    // 2. write
    const writeResult = await write(to);
    if (!writeResult.ok) {
      return { ok: false, from: to, to, reason: 'write_noop' };
    }

    // 3. onEnter
    const onEnter = config.onEnter?.[to];
    if (onEnter) {
      await onEnter(ctx);
    }

    // 4. log (from === to is the initial-entry convention)
    if (log) {
      await log({
        from: to,
        to,
        ctx,
        at: new Date(),
        row: writeResult.row,
      });
    }

    return { ok: true, from: to, to, row: writeResult.row };
  }

  return {
    states: config.states,
    terminal: config.terminal,
    initial: config.initial,
    canTransition,
    validTransitionsFrom,
    isTerminal,
    isInitial,
    execute,
    executeInitialEntry,
  };
}
