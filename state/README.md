# @jetdevs/state

Generic, code-defined finite state machine engine for the Jetdevs Platform.

- Pure TypeScript, **zero runtime dependencies**, ESM + CJS + d.ts.
- Compile-time exhaustiveness on the transition table — missing or typo'd states are `tsc` errors, not runtime errors.
- A uniform execution pipeline: `validate → guard → onExit → write → onEnter → log`.
- Transaction-agnostic: the package never imports a database. The caller wraps `execute()` in their own transaction and threads the tx handle through the `write` and `log` callbacks.

This package is for **developer-defined** state machines (status enums in code). For **user-defined**, runtime-editable state machines (FSMs authored in a UI), see CRM's `extensions/lifecycles/` engine — different tool, different problem.

## Install

This package is consumed inside the Jetdevs polyrepo via filesystem `link:`:

```jsonc
// in any consumer's package.json
{
  "dependencies": {
    "@jetdevs/state": "link:../core-sdk/state"
  }
}
```

On Vercel deploys, `vercel-prebuild.mjs` rewrites `link:` to a published version pinned in `sdk-versions.json` (same convention as `@jetdevs/cloud`, etc).

## Usage

```ts
import { defineStateMachine } from "@jetdevs/state";

type WidgetEventCtx = {
  widgetId: number;
  orgId: number;
  reason: string;
  actorUserId?: number;
};

export const widgetStateMachine = defineStateMachine<
  "draft" | "review" | "published" | "archived",
  WidgetEventCtx
>({
  states: ["draft", "review", "published", "archived"],
  initial: "draft",
  terminal: ["archived"],
  transitions: {
    draft:     ["review", "archived"],
    review:    ["draft", "published", "archived"],
    published: ["archived"],
    archived:  ["draft"],
  },
  guards: {
    "review->published": (ctx) =>
      ctx.actorUserId !== undefined ? true : "publishing requires an actor",
  },
  onExit: {
    review: async (_ctx) => {
      // e.g. clear a reviewer-lock cache entry
    },
  },
  onEnter: {
    published: async (_ctx) => {
      // e.g. fire a webhook
    },
  },
});

// ── Pure reads (synchronous, O(1)) ────────────────────────────────────────
widgetStateMachine.canTransition("draft", "review");        // true
widgetStateMachine.validTransitionsFrom("review");           // ["draft", "published", "archived"]
widgetStateMachine.isTerminal("archived");                   // true
widgetStateMachine.isInitial("draft");                       // true
```

## Side-effecting transitions

`execute()` runs the full pipeline. The `write` callback is the consumer's actual UPDATE statement, and the `log` callback is the optional audit-row insert. Wrap the call in your own transaction for atomicity:

```ts
const result = await db.transaction(async (tx) => {
  return widgetStateMachine.execute({
    from: "draft",
    to: "review",
    ctx: { widgetId: 42, orgId: 1, reason: "user-submitted", actorUserId: 7 },
    write: async (to) => {
      const [row] = await tx
        .update(widgets)
        .set({ status: to })
        .where(and(eq(widgets.id, 42), eq(widgets.status, "draft")))
        .returning();
      return row ? { ok: true, row } : { ok: false };
    },
    log: async (entry) => {
      await tx.insert(widgetTransitionLog).values({
        widgetId: entry.ctx.widgetId,
        fromStatus: entry.from,
        toStatus: entry.to,
        reason: entry.ctx.reason,
        actorUserId: entry.ctx.actorUserId,
        at: entry.at,
      });
    },
  });
});

if (!result.ok) {
  // result.reason is "invalid_transition" | "guard_failed" | "write_noop"
  // result.error is set when reason === "guard_failed"
}
```

### Pipeline semantics

```
1. canTransition(from, to)        → false → { ok:false, reason:"invalid_transition" }
2. guards[`from->to`]?.(ctx)      → string → { ok:false, reason:"guard_failed", error }
3. await onExit[from]?.(ctx)      (throws propagate to caller)
4. const {ok,row} = await write(to) → ok:false → { ok:false, reason:"write_noop" }
5. await onEnter[to]?.(ctx)       (throws propagate)
6. await log?.({from,to,ctx,at,row}) (throws propagate)
                                  → { ok:true, from, to, row }
```

- **Soft failures** (steps 1, 2, 4) return a `{ ok: false, reason }` result. They never throw.
- **Hard failures** (any thrown exception inside a guard, hook, write, or log) propagate out of `execute()`. If the caller wrapped in a transaction, the transaction rolls back automatically — the row update, the log insert, and any side effects committed inside the consumer's tx all unwind together.

### `executeInitialEntry`

For freshly-inserted rows, use `executeInitialEntry` to fire `onEnter` and write an audit row through the same `log` callback your other transitions use:

```ts
const result = await db.transaction(async (tx) => {
  return widgetStateMachine.executeInitialEntry({
    to: "draft",
    ctx: { widgetId: 0, orgId: 1, reason: "created", actorUserId: 7 },
    write: async (to) => {
      const [row] = await tx
        .insert(widgets)
        .values({ status: to, /* ... */ })
        .returning();
      return row ? { ok: true, row } : { ok: false };
    },
    log: async (entry) => {
      await tx.insert(widgetTransitionLog).values({
        widgetId: entry.row.id,           // DB-generated id available here
        fromStatus: entry.from,           // === entry.to (initial-entry convention)
        toStatus: entry.to,
        reason: entry.ctx.reason,
        actorUserId: entry.ctx.actorUserId,
        at: entry.at,
      });
    },
  });
});
```

Pipeline: `validate(to in states) → write → onEnter → log`. There is no `from`, no `onExit`, no transition-table consultation. The log entry sets `from === to` so audit queries can match `from = to` to find "initial entry" rows — same convention as CRM's lifecycle log.

## Atomicity contract

The package never imports a database. It cannot roll back anything itself. **The caller is responsible for atomicity** by wrapping `execute()` (or `executeInitialEntry()`) in their own transaction and threading the `tx` handle through both the `write` and `log` callbacks.

When followed, the contract guarantees:

1. **Status update + audit row commit or rollback together.** A failed `log` insert rolls back the status update. Never a state change without an audit row, never an audit row without a state change.
2. **Hooks observe a consistent snapshot.** `onEnter` runs after the row is updated within the same transaction. If `onEnter` throws, both the update and the log unwind.
3. **No raw `db.update` outside the transaction.** Consumers funnel every status mutator through the same pattern, so transition logic cannot drift across call sites.

If a consumer chooses NOT to wrap in a transaction (e.g. fire-and-forget logging that should not block the state change), they can pass a `log` callback that swallows its own errors. The package's only opinion is "throws propagate".

## Compile-time exhaustiveness

Omitting a state from `transitions` is a `tsc` error:

```ts
// ❌ Compile error — `archived` is missing from `transitions`
defineStateMachine({
  states:    ["draft", "review", "published", "archived"],
  initial:   "draft",
  terminal:  ["archived"],
  transitions: {
    draft:     ["review", "archived"],
    review:    ["draft", "published", "archived"],
    published: ["archived"],
    // archived: ... ← missing! tsc error: Property 'archived' is missing
  },
});
```

A typo in a state name is also a compile error:

```ts
// ❌ Compile error — "reveiw" is not in the state union
transitions: {
  draft: ["reveiw"], // ← tsc error: Type '"reveiw"' is not assignable
  // ...
}
```

This is the package's primary value-add over hand-rolled `if (status === 'X')` predicates: every call site is checked at compile time, and adding a new state forces every transition table to be updated.

## Recommended consumer schemas

A common `EvtCtx` shape that works for most domains:

```ts
type EventCtx = {
  /** The aggregate's primary key */
  entityId: number;
  /** Multi-tenant scoping */
  orgId: number;
  /** Human-readable reason for the transition */
  reason: string;
  /** Optional actor for audit attribution */
  actorUserId?: number;
  /** Optional structured payload */
  metadata?: Record<string, unknown>;
};
```

A copy-pasteable Drizzle transition log table (adapt the foreign key + status column type to your domain):

```ts
import {
  pgTable,
  serial,
  integer,
  text,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";

export const widgetTransitionLog = pgTable("widget_transition_log", {
  id: serial("id").primaryKey(),
  widgetId: integer("widget_id").notNull(),
  // NOT NULL on both sides — initial entries set from_status = to_status.
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  reason: text("reason").notNull(),
  actorUserId: integer("actor_user_id"),
  metadata: jsonb("metadata"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
```

**Initial entries** set `from_status = to_status` so audit queries can match `WHERE from_status = to_status` to find row creation events. Regular transitions always have `from_status != to_status`.

## API surface

```ts
import {
  defineStateMachine,
  type StateMachine,
  type StateMachineConfig,
  type TransitionTable,
  type TransitionResult,
  type TransitionLogEntry,
  type WriteResult,
  type GuardResult,
  type GuardKey,
} from "@jetdevs/state";
```

- `defineStateMachine<const S extends string, EvtCtx>(config)` → `StateMachine<S, EvtCtx>`
- `StateMachine#canTransition(from, to)` → `boolean` (synchronous, O(1))
- `StateMachine#validTransitionsFrom(state)` → `readonly S[]` (synchronous, O(1))
- `StateMachine#isTerminal(state)` / `isInitial(state)` → `boolean`
- `StateMachine#execute({from, to, ctx, write, log})` → `Promise<TransitionResult<S, R>>`
- `StateMachine#executeInitialEntry({to, ctx, write, log})` → `Promise<TransitionResult<S, R>>`

## Build, test, typecheck

```bash
pnpm --filter @jetdevs/state build       # tsup → dist/{esm,cjs,dts}
pnpm --filter @jetdevs/state test        # vitest, no DB, no I/O
pnpm --filter @jetdevs/state typecheck   # tsc --noEmit on tsconfig.types.json (gates the @ts-expect-error cases in src/type-tests.ts)
```

The `typecheck` script is a separate gate from `build`: `tsconfig.json` excludes `src/type-tests.ts` so it does not ship in `dist/`, while `tsconfig.types.json` includes it so the negative-test directives are actually verified by `tsc`.
