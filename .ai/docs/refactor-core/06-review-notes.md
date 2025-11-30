# Core/Extension Refactor Review Notes

These notes track the review feedback and resolution status for the core/extension architecture docs.

---

## Status: ✅ ALL ISSUES RESOLVED

All gaps identified have been verified as addressed. See verification below.

---

## Verification Results

### 02-architecture-plan.md ✅
- **composeRouters implementation**: Uses `t.mergeRouters()` and `t.router()` at line 726 - NOT `_def`
- **_def references**: Only appear in "What NOT to Do" section (lines 658-663) as forbidden patterns
- **Key design decisions**: Documented that extensions are namespaced, not flat-merged

### 03-migration-guide.md ✅
- **Router pattern**: Uses `composeRouters()` with warning against `_def` (line 1025)
- **Permission merging**: `mergePermissions()` with strict collision checking (lines 210-275)
  - `strict: true` default - collisions throw errors
  - `allowOverride` option for explicit overrides
  - Call site uses `{ strict: true }` at line 887
- **Migration lanes**: Full section at lines 1125-1240+ with:
  - Lane architecture (core → extensions → app)
  - Orchestrator implementation
  - State tracking table schema
  - Rollback support per lane
- **RLS context**: Section at lines 1284+ explaining middleware handling

### 04-extension-guide.md ✅
- **createRouterWithActor**: Required at lines 9-27 (Critical Requirements section)
- **Permission namespacing**: Required at lines 30-51
- **RLS context for extensions**: Section at lines 1187-1205 explaining automatic vs manual
- **Extension migration lanes**: Section at lines 1150-1183

### 05-contracts.md ✅
- **composeRouters**: Implementation note at line 35-37 confirms `t.mergeRouters()` usage
- **Permission collisions**: `allowOverride` documented at line 231
- **All 7 contracts**: Documented with sanctioned and forbidden patterns

---

## Quick Fix Checklist - ALL COMPLETE

- [x] Replace router examples/implementation in 02 and 03 with the finalized `composeRouters` helper (no `_def`, no `.merge`), preserving middleware.
- [x] Add lane-separated migration orchestrator + state tracking + rollback notes to 03.
- [x] Update 03/04 to strict permission merging and namespacing guidance.
- [x] Clarify privileged DB helper path/usage across docs; keep out of main exports.
- [x] Add the RLS middleware/helper note to 03 to match 02/05.

---

## Decisions Locked In

### 1. Permission Collisions: Hard-fail by default
Collisions throw fatal errors at startup. Override only with explicit `allowOverride: true`.

### 2. Privileged DB: CLI/Internal only
`createPrivilegedClient` is NOT exported from main package. Only available via:
```typescript
import { createPrivilegedClient } from '@yobo/saas-core/cli/db'
```

### 3. Package Format: ESM-only
No CJS support. Apps must use ESM imports.

### 4. Router Composition: Namespaced via t.mergeRouters()
Extensions are namespaced under their name (e.g., `trpc.projects.list`), using `t.mergeRouters()` and `t.router()` - the public tRPC API. Does NOT access `_def.procedures`.

---

## Intended Contracts (source of truth)

- **Router composition:** Single sanctioned path via `composeRouters(coreRouter, extensionRouters)`; extensions built with `createRouterWithActor`; no `_def`/`.merge`/bare `router`.
- **RLS context:** Use `setRlsContext`/`clearRlsContext`/`withRlsContext`; set per request in middleware for tRPC and manually for REST.
- **Privileged DB:** CLI-only, sourced from `ADMIN_DATABASE_URL`, short-lived; never exported from main package.
- **Permission merging:** Fatal on collisions unless explicitly overridden (`allowOverride`); enforce namespacing; provide idempotent `permissions:sync`.
- **Migrations:** Separate lanes (core → extensions → app) with orchestrated order, state tracking, and rollback guidance.
- **Packaging:** ESM-only; `"use client"` preserved; CSS/tokens consumed by apps (not bundled).
