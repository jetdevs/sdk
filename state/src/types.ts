/**
 * For every state in S, the list of states it may transition TO.
 * Required to be exhaustive: omitting any state in S is a tsc error.
 */
export type TransitionTable<S extends string> = {
  readonly [K in S]: readonly S[];
};

/**
 * Guards return either `true` (allowed) or a string (rejection message).
 * The string is surfaced in the TransitionResult.error field.
 */
export type GuardResult = true | string;

/**
 * Guards are keyed by `"from->to"`. Only declare guards for the edges that
 * have preconditions; omitted edges are unconditionally allowed (subject to
 * the transition table itself).
 */
export type GuardKey<S extends string> = `${S}->${S}`;

export interface StateMachineConfig<S extends string, EvtCtx = unknown> {
  /** Exhaustive list of legal states. Drives the literal-type inference for S. */
  readonly states: readonly S[];
  /** The state a freshly-created aggregate enters. */
  readonly initial: S;
  /** Terminal states. */
  readonly terminal: readonly S[];
  /** For every state in `states`, the list of states it may transition to. */
  readonly transitions: TransitionTable<S>;
  /** Optional typed guards keyed by `"from->to"`. */
  readonly guards?: Partial<Record<GuardKey<S>, (ctx: EvtCtx) => GuardResult>>;
  /**
   * Side effects that run BEFORE the write, for the state being left.
   */
  readonly onExit?: Partial<Record<S, (ctx: EvtCtx) => Promise<void> | void>>;
  /**
   * Side effects that run AFTER the write, for the state being entered.
   * Receives `ctx` only. Consumers needing the post-write row should use the
   * `log` callback (which receives `entry.row`) or close over a let-binding.
   */
  readonly onEnter?: Partial<Record<S, (ctx: EvtCtx) => Promise<void> | void>>;
}

export interface TransitionLogEntry<S extends string, EvtCtx, R = unknown> {
  readonly from: S;
  readonly to: S;
  readonly ctx: EvtCtx;
  readonly at: Date;
  /**
   * The row returned by the `write` callback. Always defined when `log`
   * is called — the type system enforces this via the discriminated
   * `WriteResult<R>` (`{ ok: true; row: R }`).
   */
  readonly row: R;
}

/**
 * Discriminated result of the consumer-supplied `write` callback. The
 * `ok: true` branch GUARANTEES `row` is present (type-level), so when the
 * pipeline reaches `log` and constructs a `TransitionLogEntry`, the `row`
 * field is always defined.
 */
export type WriteResult<R> =
  | { readonly ok: true; readonly row: R }
  | { readonly ok: false };

export type TransitionResult<S extends string, R> =
  | { ok: true; from: S; to: S; row: R }
  | {
      ok: false;
      from: S;
      to: S;
      reason: 'invalid_transition' | 'guard_failed' | 'write_noop';
      error?: string;
    };

export interface StateMachine<S extends string, EvtCtx = unknown> {
  readonly states: readonly S[];
  readonly terminal: readonly S[];
  readonly initial: S;

  canTransition(from: S, to: S): boolean;
  validTransitionsFrom(state: S): readonly S[];
  isTerminal(state: S): boolean;
  isInitial(state: S): boolean;

  execute<R>(args: {
    from: S;
    to: S;
    ctx: EvtCtx;
    write: (to: S) => Promise<WriteResult<R>>;
    log?: (entry: TransitionLogEntry<S, EvtCtx, R>) => Promise<void>;
  }): Promise<TransitionResult<S, R>>;

  executeInitialEntry<R>(args: {
    to: S;
    ctx: EvtCtx;
    write: (to: S) => Promise<WriteResult<R>>;
    log?: (entry: TransitionLogEntry<S, EvtCtx, R>) => Promise<void>;
  }): Promise<TransitionResult<S, R>>;
}
