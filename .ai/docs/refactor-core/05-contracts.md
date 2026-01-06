# Core/Extension Contracts

This document defines the **sanctioned patterns** and **contracts** that MUST be followed when developing with the SaaS Core framework. These contracts ensure consistency, security, and maintainability.

---

## 1. Router Composition Contract

### The Rule

> **Use ONLY `composeRouters()` to combine routers. Never use `.merge()`, `_def.procedures`, or bare `router()` calls.**

### Sanctioned Pattern

```typescript
// apps/my-saas/src/server/api/root.ts

import { coreRouter, composeRouters } from '@jetdevs/saas-core/trpc'
import config from '../../../saas.config'

const extensionRouters = config.extensions
  .filter(ext => ext.router)
  .map(ext => ({ name: ext.name, router: ext.router! }))

export const appRouter = composeRouters(coreRouter, extensionRouters)
```

### Why?

- `.merge()` loses middleware context
- `_def.procedures` bypasses type safety
- `router()` doesn't include shared auth/permission middleware
- `composeRouters()` validates no collisions and preserves middleware chain

### Implementation Note

`composeRouters` uses `t.mergeRouters()` and `t.router()` internally - the public tRPC API. It does NOT access `_def.procedures`. Extensions are namespaced (e.g., `trpc.projects.list`), not flat-merged.

### Forbidden Patterns

```typescript
// ❌ All of these are FORBIDDEN

// Direct merge
coreRouter.merge(extensionRouters)

// Accessing internals
const merged = { ...coreRouter._def.procedures, ...extRouter._def.procedures }

// Bare router
router({ ...coreRouter, projects: projectsRouter })
```

---

## 2. Extension Router Contract

### The Rule

> **Extensions MUST use `createRouterWithActor()` and specify permissions per procedure.**

### Sanctioned Pattern

```typescript
// src/extensions/my-feature/router.ts

import { createRouterWithActor } from '@jetdevs/saas-core/trpc'
import { z } from 'zod'

export const myRouter = createRouterWithActor({
  list: {
    type: 'query',
    permission: 'myfeature:read',  // REQUIRED
    input: z.object({ ... }).optional(),
    handler: async ({ input, ctx }) => {
      // ctx.actor is guaranteed to exist
      // ctx.db has RLS context set
      return await ctx.db.select().from(myTable)
    },
  },

  create: {
    type: 'mutation',
    permission: 'myfeature:create',  // REQUIRED
    input: z.object({ ... }),
    handler: async ({ input, ctx }) => {
      // Permission already checked by middleware
      return await ctx.db.insert(myTable).values({ ... })
    },
  },
})
```

### Why?

- `createRouterWithActor` automatically includes auth middleware
- `permission` field enforces permission check before handler
- `ctx.actor` provides typed access to current user/org
- `ctx.db` has RLS context already set

### Forbidden Patterns

```typescript
// ❌ FORBIDDEN: Using bare procedures
import { protectedProcedure, router } from '@trpc/server'

export const myRouter = router({
  list: protectedProcedure.query(() => { ... })  // No permission check!
})

// ❌ FORBIDDEN: Missing permission
export const myRouter = createRouterWithActor({
  list: {
    type: 'query',
    // permission: missing!  <- Will throw at startup
    handler: async () => { ... }
  },
})
```

---

## 3. RLS Context Contract

### The Rule

> **RLS context (`rls.current_org_id`) MUST be set before any database query and cleared after.**

### Sanctioned Pattern (Automatic)

```typescript
// This is handled automatically by protectedProcedure middleware
// You don't need to do anything in normal tRPC handlers

export const myRouter = createRouterWithActor({
  list: {
    type: 'query',
    permission: 'myfeature:read',
    handler: async ({ ctx }) => {
      // ✅ RLS context is already set by middleware
      return await ctx.db.select().from(myTable)
    },
  },
})
```

### Sanctioned Pattern (Manual - for REST/non-tRPC)

```typescript
import { withRlsContext } from '@jetdevs/saas-core/rls'

export async function GET(req: Request) {
  const session = await getServerSession()
  if (!session?.user?.orgId) {
    return new Response('Unauthorized', { status: 401 })
  }

  return withRlsContext(db, session.user.orgId, session.user.id, async () => {
    const data = await db.select().from(myTable)
    return Response.json(data)
  })
}
```

### Why?

- RLS policies use `current_setting('rls.current_org_id')`
- Without context, queries fail or return empty results
- Context must be cleared to prevent leakage between requests

### Forbidden Patterns

```typescript
// ❌ FORBIDDEN: Direct queries without RLS context
export async function GET() {
  // RLS not set - will fail or return empty!
  const data = await db.select().from(myTable)
  return Response.json(data)
}

// ❌ FORBIDDEN: Setting context without clearing
await setRlsContext(db, orgId)
const data = await db.select().from(myTable)
// Missing clearRlsContext - context may leak!
```

---

## 4. Permission Definition Contract

### The Rule

> **Permission keys MUST be namespaced with extension name. Collisions are fatal.**

### Sanctioned Pattern

```typescript
// src/extensions/projects/permissions.ts

export const permissions: PermissionModule = {
  name: 'projects',
  displayName: 'Projects',
  permissions: {
    // ✅ All keys start with 'project:' (extension namespace)
    'project:create': { ... },
    'project:read': { ... },
    'project:update': { ... },
    'project:delete': { ... },
    'project:manage_members': { ... },
  },
}
```

### Reserved Prefixes (Core-Only)

```
admin:*     - Administrative permissions
org:*       - Organization management
user:*      - User management
role:*      - Role management
system:*    - System configuration
```

### Collision Behavior

| Scenario | Behavior |
|----------|----------|
| New unique key | ✅ Added |
| Key exists in core | ❌ **Fatal Error** |
| Key exists in another extension | ❌ **Fatal Error** |
| Same key, identical definition | ❌ **Fatal Error** (unless `allowOverride: true`) |

### Forbidden Patterns

```typescript
// ❌ FORBIDDEN: Using reserved prefix
permissions: {
  'admin:custom': { ... }  // Collides with core!
}

// ❌ FORBIDDEN: Generic unnamespaced keys
permissions: {
  'create': { ... }     // Will collide
  'read': { ... }       // Will collide
}
```

---

## 5. Database Schema Contract

### The Rule

> **All extension tables MUST have `org_id` column for RLS isolation.**

### Sanctioned Pattern

```typescript
// src/extensions/projects/schema.ts

import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'
import { schema } from '@jetdevs/saas-core'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),

  // ✅ REQUIRED: org_id for RLS
  orgId: uuid('org_id')
    .notNull()
    .references(() => schema.orgs.id, { onDelete: 'cascade' }),

  // Other columns...
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})
```

### Child Tables (without direct org_id)

For tables that reference a parent with `org_id`, use custom RLS policies:

```typescript
// Schema
export const projectTasks = pgTable('project_tasks', {
  id: uuid('id').primaryKey(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  // No direct org_id - RLS joins through projects
})

// RLS config
export const rlsConfig: RlsTableConfig[] = [
  {
    tableName: 'project_tasks',
    customPolicies: [
      `CREATE POLICY "project_tasks_org_isolation" ON project_tasks
       FOR ALL USING (
         project_id IN (
           SELECT id FROM projects
           WHERE org_id = current_setting('rls.current_org_id')::integer
         )
       )`,
    ],
  },
]
```

### Forbidden Patterns

```typescript
// ❌ FORBIDDEN: Table without org_id
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  name: text('name'),
  // Missing org_id - RLS won't work!
})
```

---

## 6. Migration Lane Contract

### The Rule

> **Core and extension migrations are in separate lanes. Core runs first, always.**

### Lane Order

```
1. Core migrations     (packages/saas-core/migrations)
2. Extension migrations (apps/my-saas/drizzle/extensions/*)
3. App migrations      (apps/my-saas/drizzle/app)
```

### Sanctioned Command

```bash
# Runs all lanes in correct order
pnpm saas migrate
```

### Migration Requirements

All migrations MUST be idempotent:

```sql
-- ✅ GOOD: Idempotent
CREATE TABLE IF NOT EXISTS my_table (...);
CREATE INDEX IF NOT EXISTS idx_name ON my_table(column);

-- ❌ BAD: Will fail on re-run
CREATE TABLE my_table (...);
CREATE INDEX idx_name ON my_table(column);
```

---

## 7. Build Target Contract

### The Rule

> **Core package is ESM-only. UI components preserve `"use client"` directives.**

### Supported

| Format | Support |
|--------|---------|
| ESM | ✅ Yes (primary) |
| CJS | ❌ No |
| React Server Components | ✅ Yes |
| React Client Components | ✅ Yes (directives preserved) |

### Consuming App Requirements

```typescript
// tailwind.config.ts
export default {
  content: [
    './src/**/*.{ts,tsx}',
    // Include core UI components
    './node_modules/@jetdevs/saas-core/dist/**/*.{js,jsx}',
  ],
}
```

---

## Summary Table

| Contract | Key Requirement |
|----------|-----------------|
| Router Composition | Use `composeRouters()` only |
| Extension Router | Use `createRouterWithActor()` with `permission` |
| RLS Context | Auto via middleware, or `withRlsContext()` for manual |
| Permission Keys | Namespace with extension name |
| Database Schema | Include `org_id` on all tables |
| Migrations | Separate lanes, core first, idempotent |
| Build | ESM-only, preserve `"use client"` |
