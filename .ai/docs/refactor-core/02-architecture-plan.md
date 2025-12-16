# Detailed Architecture Plan

## Target Directory Structure

```
monorepo/
├── packages/
│   └── saas-core/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts                    # Main exports
│       │   │
│       │   ├── auth/                       # Authentication Module
│       │   │   ├── index.ts
│       │   │   ├── config.ts               # NextAuth configuration factory
│       │   │   ├── providers/              # OAuth providers
│       │   │   ├── session.ts              # Session utilities
│       │   │   ├── middleware.ts           # Auth middleware
│       │   │   └── types.ts
│       │   │
│       │   ├── db/                         # Database Module
│       │   │   ├── index.ts
│       │   │   ├── client.ts               # Drizzle client factory
│       │   │   ├── schema/
│       │   │   │   ├── index.ts            # Schema aggregator
│       │   │   │   ├── orgs.ts             # organizations table
│       │   │   │   ├── users.ts            # users table
│       │   │   │   ├── rbac.ts             # roles, permissions, assignments
│       │   │   │   ├── audit.ts            # audit_logs
│       │   │   │   ├── auth.ts             # auth_accounts, sessions
│       │   │   │   ├── themes.ts           # themes
│       │   │   │   ├── system.ts           # system_config, feature_flags
│       │   │   │   └── api.ts              # api_keys, usage_logs
│       │   │   ├── migrations/             # Core migrations
│       │   │   ├── seeds/
│       │   │   │   ├── index.ts
│       │   │   │   ├── seed-rbac.ts
│       │   │   │   ├── seed-permissions.ts
│       │   │   │   └── seed-themes.ts
│       │   │   └── types.ts
│       │   │
│       │   ├── permissions/                # Permission Module
│       │   │   ├── index.ts
│       │   │   ├── registry.ts             # Core permissions registry
│       │   │   ├── types.ts                # Permission types
│       │   │   ├── validator.ts            # Validation logic
│       │   │   ├── merger.ts               # Merge core + extension permissions
│       │   │   └── hooks.ts                # usePermissionCheck, etc.
│       │   │
│       │   ├── rbac/                       # Role-Based Access Control
│       │   │   ├── index.ts
│       │   │   ├── service.ts              # RBAC business logic
│       │   │   ├── repository.ts           # Data access
│       │   │   └── types.ts
│       │   │
│       │   ├── rls/                        # Row-Level Security
│       │   │   ├── index.ts
│       │   │   ├── registry.ts             # RLS table configuration
│       │   │   ├── policies.ts             # Policy generators
│       │   │   ├── deploy.ts               # Deployment scripts
│       │   │   └── context.ts              # RLS context management
│       │   │
│       │   ├── trpc/                       # tRPC Infrastructure
│       │   │   ├── index.ts
│       │   │   ├── context.ts              # Context creation
│       │   │   ├── middleware.ts           # Auth, permission middleware
│       │   │   ├── router-factory.ts       # createRouterWithActor
│       │   │   ├── procedures.ts           # Base procedures
│       │   │   ├── routers/                # Core routers
│       │   │   │   ├── auth.router.ts
│       │   │   │   ├── user.router.ts
│       │   │   │   ├── role.router.ts
│       │   │   │   ├── permission.router.ts
│       │   │   │   ├── org.router.ts
│       │   │   │   ├── theme.router.ts
│       │   │   │   └── system.router.ts
│       │   │   └── types.ts
│       │   │
│       │   ├── ui/                         # UI Components
│       │   │   ├── index.ts
│       │   │   ├── primitives/             # Shadcn/ui base components
│       │   │   │   ├── button.tsx
│       │   │   │   ├── input.tsx
│       │   │   │   ├── form.tsx
│       │   │   │   ├── dialog.tsx
│       │   │   │   ├── table.tsx
│       │   │   │   └── ...
│       │   │   ├── data-table/             # Data table system
│       │   │   │   ├── DataTable.tsx
│       │   │   │   ├── columns.tsx
│       │   │   │   └── filters.tsx
│       │   │   ├── layout/                 # Layout components
│       │   │   │   ├── AppSkeleton.tsx
│       │   │   │   ├── Sidebar.tsx
│       │   │   │   └── Header.tsx
│       │   │   ├── auth/                   # Auth UI components
│       │   │   │   ├── LoginForm.tsx
│       │   │   │   ├── RegisterForm.tsx
│       │   │   │   └── AuthGuard.tsx
│       │   │   └── theme/
│       │   │       └── ThemeSwitcher.tsx
│       │   │
│       │   ├── hooks/                      # Framework Hooks
│       │   │   ├── index.ts
│       │   │   ├── useTable.ts
│       │   │   ├── useTableFilter.ts
│       │   │   ├── useTableSort.ts
│       │   │   ├── useAuthSession.ts
│       │   │   ├── usePermissionCheck.ts
│       │   │   ├── usePermissionContext.ts
│       │   │   ├── useSidebarStore.ts
│       │   │   ├── useModalState.ts
│       │   │   └── useFormValidation.ts
│       │   │
│       │   ├── stores/                     # State Management
│       │   │   ├── index.ts
│       │   │   ├── auth.store.ts
│       │   │   └── ui.store.ts
│       │   │
│       │   ├── providers/                  # React Providers
│       │   │   ├── index.ts
│       │   │   ├── TRPCProvider.tsx
│       │   │   ├── AuthProvider.tsx
│       │   │   └── ThemeProvider.tsx
│       │   │
│       │   ├── lib/                        # Utility Libraries
│       │   │   ├── index.ts
│       │   │   ├── utils.ts
│       │   │   ├── logger.ts
│       │   │   ├── generate-id.ts
│       │   │   ├── rate-limit.ts
│       │   │   └── email.ts
│       │   │
│       │   ├── config/                     # Configuration System
│       │   │   ├── index.ts
│       │   │   ├── schema.ts               # Config validation schema
│       │   │   ├── defaults.ts             # Default configuration
│       │   │   └── loader.ts               # Load & merge config
│       │   │
│       │   └── cli/                        # CLI Tools
│       │       ├── index.ts
│       │       ├── commands/
│       │       │   ├── db-setup.ts
│       │       │   ├── db-migrate.ts
│       │       │   ├── db-seed.ts
│       │       │   ├── rls-deploy.ts
│       │       │   ├── generate-permissions.ts
│       │       │   └── scaffold-extension.ts
│       │       └── utils.ts
│       │
│       ├── scripts/                        # Build/dev scripts
│       │   └── build.ts
│       │
│       └── CHANGELOG.md
│
├── apps/
│   └── my-saas/                            # Application
│       ├── package.json
│       ├── next.config.mjs
│       ├── saas.config.ts                  # Core configuration
│       ├── tsconfig.json
│       │
│       ├── src/
│       │   ├── app/                        # Next.js App Router
│       │   │   ├── layout.tsx
│       │   │   ├── (auth)/                 # Auth routes (use core)
│       │   │   │   ├── login/
│       │   │   │   └── register/
│       │   │   ├── (dashboard)/            # Dashboard layout
│       │   │   │   ├── layout.tsx
│       │   │   │   └── page.tsx
│       │   │   ├── (features)/             # Feature routes
│       │   │   │   └── [feature]/
│       │   │   ├── backoffice/             # Admin (uses core)
│       │   │   └── api/
│       │   │       ├── auth/[...nextauth]/ # NextAuth (configured)
│       │   │       └── trpc/[trpc]/        # tRPC (composed)
│       │   │
│       │   ├── server/                     # Server-side code
│       │   │   ├── api/
│       │   │   │   ├── root.ts             # Composed router
│       │   │   │   └── trpc.ts             # App-specific context
│       │   │   └── auth/
│       │   │       └── config.ts           # Auth customization
│       │   │
│       │   ├── extensions/                 # Feature Extensions
│       │   │   ├── index.ts                # Extension registry
│       │   │   │
│       │   │   ├── projects/               # Example: Projects feature
│       │   │   │   ├── index.ts            # Extension definition
│       │   │   │   ├── schema.ts           # Database tables
│       │   │   │   ├── permissions.ts      # Permission definitions
│       │   │   │   ├── router.ts           # tRPC router
│       │   │   │   ├── service.ts          # Business logic
│       │   │   │   ├── repository.ts       # Data access
│       │   │   │   └── components/
│       │   │   │       ├── ProjectList.tsx
│       │   │   │       ├── ProjectForm.tsx
│       │   │   │       └── ...
│       │   │   │
│       │   │   └── invoices/               # Example: Invoices feature
│       │   │       ├── index.ts
│       │   │       ├── schema.ts
│       │   │       ├── permissions.ts
│       │   │       ├── router.ts
│       │   │       └── components/
│       │   │
│       │   ├── components/                 # App-specific components
│       │   │   ├── dashboard/
│       │   │   ├── layout/
│       │   │   │   └── AppSidebar.tsx      # Extends core sidebar
│       │   │   └── ...
│       │   │
│       │   ├── config/                     # App configuration
│       │   │   ├── navigation.ts           # Sidebar items
│       │   │   └── theme.ts                # Brand customization
│       │   │
│       │   └── styles/
│       │       └── globals.css
│       │
│       └── drizzle/                        # App migrations
│           └── ...
│
├── pnpm-workspace.yaml
├── package.json
└── turbo.json                              # Build orchestration
```

## Build & Package Targets

> **IMPORTANT**: The core package is **ESM-only**. CJS is not supported.

### Supported Targets

| Target | Supported | Notes |
|--------|-----------|-------|
| ESM | ✅ Yes | Primary format |
| CJS | ❌ No | Not supported - use ESM |
| React Server Components | ✅ Yes | Server-only exports available |
| React Client Components | ✅ Yes | `"use client"` preserved in build |

### UI Component Handling

- All UI components preserve `"use client"` directives in the build
- CSS is **not bundled** - apps must import Tailwind and configure `content` paths
- Design tokens exported as CSS variables via `@jetdevs/saas-core/styles`

```typescript
// tailwind.config.ts in consuming app
export default {
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@jetdevs/saas-core/dist/**/*.{js,jsx}', // Include core UI
  ],
  // ...
}
```

---

## Core Package Exports

### Main Entry (`packages/saas-core/src/index.ts`)

```typescript
// ==========================================
// @jetdevs/saas-core - Main Exports
// ==========================================

// Configuration
export { defineSaasConfig } from './config'
export type { SaasConfig } from './config'

// Database
export { createDbClient } from './db'
export * as schema from './db/schema'
export type { DbClient, Transaction } from './db'

// Authentication
export { createAuthConfig, getServerSession } from './auth'
export type { AuthConfig, Session, User } from './auth'

// Permissions
export {
  corePermissions,
  createPermissionRegistry,
  validatePermissions,
  mergePermissions
} from './permissions'
export type { Permission, PermissionModule, PermissionKey } from './permissions'

// RBAC
export { RbacService, RoleRepository } from './rbac'
export type { Role, RoleAssignment } from './rbac'

// RLS
export {
  createRlsRegistry,
  setRlsContext,
  clearRlsContext
} from './rls'

// tRPC
export {
  createTRPCContext,
  createRouterWithActor,
  composeRouters,
  protectedProcedure,
  publicProcedure,
  coreRouter
} from './trpc'
export type { TRPCContext, Actor } from './trpc'

// UI Components
export * from './ui/primitives'
export { DataTable } from './ui/data-table'
export { AppSkeleton, Sidebar } from './ui/layout'
export { AuthGuard, LoginForm, RegisterForm } from './ui/auth'
export { ThemeSwitcher } from './ui/theme'

// Hooks
export {
  useTable,
  useTableFilter,
  useAuthSession,
  usePermissionCheck,
  usePermissionContext,
  useSidebarStore,
  useModalState
} from './hooks'

// Stores
export { useAuthStore, useUIStore } from './stores'

// Providers
export { TRPCProvider, AuthProvider, ThemeProvider } from './providers'

// Utilities
export { cn, generateId, logger } from './lib'

// CLI (for scripts only - not exported from main)
// Use: import { cli } from '@jetdevs/saas-core/cli'
```

### Internal/CLI-Only Exports

The following are **internal** and only available via CLI or direct import paths:

```typescript
// CLI tools - only for scripts, not runtime
import { cli } from '@jetdevs/saas-core/cli'

// Privileged DB access - CLI/migrations only, NOT for application code
// Uses ADMIN_DATABASE_URL, bypasses RLS
import { createPrivilegedClient } from '@jetdevs/saas-core/cli/db'
```

> **WARNING**: `createPrivilegedClient` is for migrations and RLS deployment only.
> Never use in application code - it bypasses all security policies.

## Configuration Schema

### `saas.config.ts`

```typescript
import { defineSaasConfig } from '@jetdevs/saas-core'
import { projectsExtension } from './src/extensions/projects'
import { invoicesExtension } from './src/extensions/invoices'

export default defineSaasConfig({
  // Application Info
  app: {
    name: 'My SaaS App',
    version: '1.0.0',
  },

  // Authentication Configuration
  auth: {
    providers: ['credentials', 'google', 'github'],
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    pages: {
      signIn: '/login',
      signUp: '/register',
      error: '/auth/error',
    },
    callbacks: {
      // Optional: Custom session callback
      session: async ({ session, token }) => {
        // Custom logic
        return session
      },
    },
  },

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL!,
    adminUrl: process.env.ADMIN_DATABASE_URL,
    migrationsPath: './drizzle',
    rls: {
      enabled: true,
      contextVar: 'rls.current_org_id',
    },
  },

  // Permission Extensions
  permissions: {
    autoSync: true, // Auto-sync to database on startup
  },

  // Extensions (Your Features)
  extensions: [
    projectsExtension,
    invoicesExtension,
  ],

  // UI Configuration
  ui: {
    theme: {
      defaultTheme: 'system',
      brandColor: '#0070f3',
    },
    sidebar: {
      // App provides navigation config
      configPath: './src/config/navigation.ts',
    },
  },

  // Feature Flags
  features: {
    multiTenant: true,
    auditLog: true,
    apiKeys: true,
    themes: true,
  },

  // Hooks for lifecycle events
  hooks: {
    'user:created': async (user) => {
      // Custom logic after user creation
    },
    'org:created': async (org) => {
      // Custom logic after org creation
    },
  },
})
```

## Extension Definition Pattern

### Extension Interface

```typescript
// packages/saas-core/src/config/extension.ts

export interface Extension {
  name: string
  version: string

  // Database schema (Drizzle tables)
  schema?: Record<string, PgTable>

  // Permission definitions
  permissions?: PermissionModule

  // tRPC router
  router?: AnyRouter

  // RLS configuration
  rls?: RlsTableConfig[]

  // Lifecycle hooks
  hooks?: {
    onInstall?: () => Promise<void>
    onEnable?: () => Promise<void>
    onDisable?: () => Promise<void>
  }

  // Seed data
  seeds?: () => Promise<void>
}

export function defineExtension(config: Extension): Extension {
  return config
}
```

### Example Extension: Projects

```typescript
// apps/my-saas/src/extensions/projects/index.ts

import { defineExtension } from '@jetdevs/saas-core'
import * as schema from './schema'
import { permissions } from './permissions'
import { projectsRouter } from './router'
import { rlsConfig } from './rls'

export const projectsExtension = defineExtension({
  name: 'projects',
  version: '1.0.0',

  schema,
  permissions,
  router: projectsRouter,
  rls: rlsConfig,

  hooks: {
    onInstall: async () => {
      console.log('Projects extension installed')
    },
  },
})
```

```typescript
// apps/my-saas/src/extensions/projects/schema.ts

import { pgTable, text, uuid, timestamp, boolean } from 'drizzle-orm/pg-core'
import { schema } from '@jetdevs/saas-core'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => schema.orgs.id),
  ownerId: uuid('owner_id').notNull().references(() => schema.users.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const projectMembers = pgTable('project_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  userId: uuid('user_id').notNull().references(() => schema.users.id),
  role: text('role').notNull().default('member'),
  createdAt: timestamp('created_at').defaultNow(),
})
```

```typescript
// apps/my-saas/src/extensions/projects/permissions.ts

import type { PermissionModule } from '@jetdevs/saas-core'

export const permissions: PermissionModule = {
  name: 'projects',
  displayName: 'Projects',
  permissions: {
    'project:create': {
      name: 'Create Project',
      description: 'Create new projects',
    },
    'project:read': {
      name: 'View Projects',
      description: 'View project details',
    },
    'project:update': {
      name: 'Update Project',
      description: 'Modify project settings',
    },
    'project:delete': {
      name: 'Delete Project',
      description: 'Delete projects',
    },
    'project:manage_members': {
      name: 'Manage Members',
      description: 'Add/remove project members',
    },
  },
}
```

```typescript
// apps/my-saas/src/extensions/projects/router.ts

import { createRouterWithActor } from '@jetdevs/saas-core'
import { z } from 'zod'
import { ProjectRepository } from './repository'
import { ProjectService } from './service'

export const projectsRouter = createRouterWithActor({
  list: {
    type: 'query',
    permission: 'project:read',
    input: z.object({
      status: z.enum(['active', 'archived']).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }).optional(),
    cache: { ttl: 60, tags: ['projects'] },
    repository: ProjectRepository,
    handler: async ({ input, repo, actor }) => {
      return repo.list(input)
    },
  },

  create: {
    type: 'mutation',
    permission: 'project:create',
    input: z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
    }),
    repository: ProjectRepository,
    handler: async ({ input, repo, actor }) => {
      return repo.create({
        ...input,
        ownerId: actor.userId,
        orgId: actor.orgId,
      })
    },
  },

  // ... other procedures
})
```

## Router Composition

> **IMPORTANT**: Use ONLY the `composeRouters` helper. Do NOT use `.merge()`, `_def.procedures`,
> or direct `router()` calls - these bypass shared middleware and lose actor/permission context.

### The Sanctioned Pattern

Core provides `composeRouters()` which:
1. Merges routers while preserving middleware chain
2. Retains auth + permission middleware on all procedures
3. Validates no procedure name collisions

### Application Router (`apps/my-saas/src/server/api/root.ts`)

```typescript
import { coreRouter, composeRouters } from '@jetdevs/saas-core/trpc'
import config from '../../../saas.config'

// Collect extension routers
const extensionRouters = config.extensions
  .filter(ext => ext.router)
  .map(ext => ({ name: ext.name, router: ext.router! }))

// Compose using the sanctioned helper
export const appRouter = composeRouters(coreRouter, extensionRouters)

export type AppRouter = typeof appRouter
```

### What NOT to Do

```typescript
// ❌ BAD: Direct merge loses middleware context
export const appRouter = coreRouter.merge(extensionRouters)

// ❌ BAD: Accessing _def bypasses type safety
const merged = {
  ...coreRouter._def.procedures,
  ...extensionRouter._def.procedures,
}

// ❌ BAD: Direct router() call loses shared middleware
export const appRouter = router({
  ...coreRouter,
  projects: projectsRouter,
})
```

### `composeRouters` Implementation

```typescript
// packages/saas-core/src/trpc/compose.ts

import { t } from './trpc'  // The initialized tRPC instance

interface ExtensionRouter {
  name: string
  router: ReturnType<typeof t.router>
}

/**
 * Compose core router with extension routers.
 *
 * This helper:
 * 1. Namespaces each extension under its name (e.g., trpc.projects.list)
 * 2. Validates no naming collisions
 * 3. Preserves middleware chain from createRouterWithActor
 *
 * NOTE: Extensions are namespaced, not merged flat. This avoids
 * reaching into router internals and preserves type safety.
 */
export function composeRouters<TCore extends ReturnType<typeof t.router>>(
  core: TCore,
  extensions: ExtensionRouter[]
): TCore & Record<string, ReturnType<typeof t.router>> {
  // Validate no extension name collisions with core router keys
  const coreKeys = new Set(Object.keys(core))
  for (const ext of extensions) {
    if (coreKeys.has(ext.name)) {
      throw new Error(
        `Router collision: Extension name "${ext.name}" conflicts with core router key. ` +
        `Choose a different extension name.`
      )
    }
  }

  // Validate no duplicate extension names
  const extNames = extensions.map(e => e.name)
  const duplicates = extNames.filter((name, i) => extNames.indexOf(name) !== i)
  if (duplicates.length > 0) {
    throw new Error(
      `Router collision: Duplicate extension names: ${[...new Set(duplicates)].join(', ')}`
    )
  }

  // Build the composed router using t.router (not _def)
  // Extensions become nested routers: trpc.projects.list, trpc.invoices.create
  const extensionRouters = Object.fromEntries(
    extensions.map(ext => [ext.name, ext.router])
  )

  return t.mergeRouters(core, t.router(extensionRouters)) as any
}
```

**Key design decisions:**
- Extensions are **namespaced** (e.g., `trpc.projects.list`) not flat-merged
- Uses `t.mergeRouters()` and `t.router()` - the public tRPC API
- Does NOT access `_def.procedures` internals
- Middleware chain from `createRouterWithActor` is preserved

## Database Schema Aggregation

### Core Schema (`packages/saas-core/src/db/schema/index.ts`)

```typescript
// Core tables that every app needs
export * from './orgs'
export * from './users'
export * from './rbac'
export * from './audit'
export * from './auth'
export * from './themes'
export * from './system'
export * from './api'
```

### App Schema (`apps/my-saas/src/db/schema.ts`)

```typescript
import * as coreSchema from '@jetdevs/saas-core/db/schema'
import config from '../../saas.config'

// Merge core + extension schemas
const extensionSchemas = config.extensions.reduce((acc, ext) => {
  if (ext.schema) {
    Object.assign(acc, ext.schema)
  }
  return acc
}, {} as Record<string, PgTable>)

export const schema = {
  ...coreSchema,
  ...extensionSchemas,
}

export type Schema = typeof schema
```

## RLS Context Management

> **CRITICAL**: RLS policies depend on `rls.current_org_id` being set per request.
> Without proper context, queries will fail or return empty results.

### How RLS Context Works

1. **PostgreSQL Session Variable**: RLS policies use `current_setting('rls.current_org_id')`
2. **Per-Request Context**: Must be set at the start of each request, cleared after
3. **Middleware Integration**: tRPC and REST middleware handle this automatically

### RLS Context Helper

```typescript
// packages/saas-core/src/rls/context.ts

import type { DbClient } from '../db'

/**
 * Set RLS context for the current database session.
 * MUST be called before any RLS-protected queries.
 */
export async function setRlsContext(
  db: DbClient,
  orgId: number | string,
  userId?: number | string
): Promise<void> {
  await db.execute(sql`SELECT set_config('rls.current_org_id', ${String(orgId)}, true)`)
  if (userId) {
    await db.execute(sql`SELECT set_config('rls.current_user_id', ${String(userId)}, true)`)
  }
}

/**
 * Clear RLS context. Call in finally block to prevent context leakage.
 */
export async function clearRlsContext(db: DbClient): Promise<void> {
  await db.execute(sql`SELECT set_config('rls.current_org_id', '', true)`)
  await db.execute(sql`SELECT set_config('rls.current_user_id', '', true)`)
}

/**
 * Execute a function with RLS context. Automatically clears on completion.
 */
export async function withRlsContext<T>(
  db: DbClient,
  orgId: number | string,
  userId: number | string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  try {
    await setRlsContext(db, orgId, userId)
    return await fn()
  } finally {
    await clearRlsContext(db)
  }
}
```

### Middleware Integration (tRPC)

```typescript
// packages/saas-core/src/trpc/middleware.ts

export const rlsMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user?.orgId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No org context' })
  }

  // Set RLS context before proceeding
  await setRlsContext(ctx.db, ctx.session.user.orgId, ctx.session.user.id)

  try {
    return await next({ ctx })
  } finally {
    // Always clear context
    await clearRlsContext(ctx.db)
  }
})

// All protected procedures include RLS middleware
export const protectedProcedure = t.procedure
  .use(authMiddleware)
  .use(rlsMiddleware)
```

### REST/API Route Integration

```typescript
// For non-tRPC routes, wrap handlers manually
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

---

## RLS Policy Extension

### RLS Registry (`packages/saas-core/src/rls/registry.ts`)

```typescript
export interface RlsTableConfig {
  tableName: string
  orgIdColumn?: string // defaults to 'org_id'
  policies?: {
    select?: boolean
    insert?: boolean
    update?: boolean
    delete?: boolean
  }
  customPolicies?: string[] // Raw SQL policies
}

export const coreRlsTables: RlsTableConfig[] = [
  { tableName: 'users', orgIdColumn: 'org_id' },
  { tableName: 'roles', orgIdColumn: 'org_id' },
  { tableName: 'user_roles', orgIdColumn: 'org_id' },
  { tableName: 'org_audit_logs', orgIdColumn: 'org_id' },
  // ... other core tables
]

export function createRlsRegistry(extensions: Extension[]): RlsTableConfig[] {
  const extensionTables = extensions.flatMap(ext => ext.rls || [])
  return [...coreRlsTables, ...extensionTables]
}
```

### Extension RLS Config

```typescript
// apps/my-saas/src/extensions/projects/rls.ts

import type { RlsTableConfig } from '@jetdevs/saas-core'

export const rlsConfig: RlsTableConfig[] = [
  { tableName: 'projects', orgIdColumn: 'org_id' },
  { tableName: 'project_members', orgIdColumn: 'org_id' },
]
```

## Permission Merging

> **IMPORTANT**: Permission collisions are **fatal by default**. Extensions cannot
> override core permissions unless explicitly opted in with `allowOverride: true`.

### Collision Rules

| Scenario | Behavior |
|----------|----------|
| Extension adds new permission | ✅ Allowed |
| Extension redefines core permission | ❌ **Error** (unless `allowOverride: true`) |
| Two extensions define same permission | ❌ **Error** |
| Extension defines same module name as core | ⚠️ Merged (permissions within must be unique) |

### Core Permissions (`packages/saas-core/src/permissions/registry.ts`)

```typescript
export const corePermissions = {
  admin: {
    name: 'Admin',
    permissions: {
      'admin:full_access': { name: 'Full Access', description: 'Complete system access' },
      // ... 8 admin permissions
    },
  },
  organization: {
    name: 'Organization',
    permissions: {
      'org:create': { name: 'Create Org', description: 'Create organizations' },
      // ... 11 org permissions
    },
  },
  users: {
    name: 'Users',
    permissions: {
      'user:create': { name: 'Create User', description: 'Create users' },
      // ... 8 user permissions
    },
  },
  roles: {
    name: 'Roles',
    permissions: {
      'role:create': { name: 'Create Role', description: 'Create roles' },
      // ... 4 role permissions
    },
  },
  system: {
    name: 'System',
    permissions: {
      'system:view_status': { name: 'View Status', description: 'View system status' },
      // ... 2 system permissions
    },
  },
}
```

### Permission Merger Implementation

```typescript
// packages/saas-core/src/permissions/merger.ts

export interface MergeOptions {
  allowOverride?: boolean  // Default: false
  strict?: boolean         // Default: true - fail on any collision
}

export function mergePermissions(
  core: PermissionRegistry,
  extensions: PermissionModule[],
  options: MergeOptions = {}
): PermissionRegistry {
  const { allowOverride = false, strict = true } = options
  const merged = structuredClone(core)
  const allPermissionKeys = new Set<string>()

  // Collect core permission keys
  for (const module of Object.values(core)) {
    for (const key of Object.keys(module.permissions)) {
      allPermissionKeys.add(key)
    }
  }

  for (const ext of extensions) {
    // Check for module collision
    if (merged[ext.name] && !allowOverride) {
      // Module exists - merge permissions but check for key collisions
      for (const [key, perm] of Object.entries(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict) {
            throw new Error(
              `Permission collision: "${key}" already exists. ` +
              `Set allowOverride: true to override, or use a unique key.`
            )
          }
          console.warn(`[WARN] Permission "${key}" overridden by extension "${ext.name}"`)
        }
        merged[ext.name].permissions[key] = perm
        allPermissionKeys.add(key)
      }
    } else {
      // New module - check individual permission keys
      for (const key of Object.keys(ext.permissions)) {
        if (allPermissionKeys.has(key)) {
          if (strict) {
            throw new Error(
              `Permission collision: "${key}" from extension "${ext.name}" ` +
              `conflicts with existing permission.`
            )
          }
        }
        allPermissionKeys.add(key)
      }
      merged[ext.name] = ext
    }
  }

  return merged
}
```

### Merged Registry

```typescript
// Automatically done by core when loading config
import { corePermissions, mergePermissions } from '@jetdevs/saas-core'
import config from './saas.config'

const extensionPermissions = config.extensions
  .filter(ext => ext.permissions)
  .map(ext => ext.permissions!)

// Will throw on collision - this is intentional!
export const permissionRegistry = mergePermissions(
  corePermissions,
  extensionPermissions,
  { strict: true, allowOverride: false }
)
```

### Permission Namespacing Convention

To avoid collisions, extensions should namespace permissions:

```typescript
// ✅ GOOD: Namespaced with extension name
'projects:create'
'projects:read'
'invoices:generate'

// ❌ BAD: Generic names that may collide
'create'
'read'
'admin'
```

### Database Sync (`permissions:sync`)

The CLI provides idempotent permission syncing:

```bash
pnpm saas permissions:sync
```

This command:
1. Compares registry to database
2. Adds new permissions
3. Updates descriptions (but not keys)
4. Optionally removes orphaned permissions (`--prune`)
5. Runs in a transaction - all or nothing

## Versioning Strategy

### Semantic Versioning

```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes
- Schema changes requiring migration
- Removed APIs
- Changed behavior

MINOR: New features (backwards compatible)
- New extension points
- New core permissions
- New UI components

PATCH: Bug fixes
- Security patches
- Performance improvements
- Bug fixes
```

### Upgrade Process

1. **Check changelog** - Review breaking changes
2. **Update dependency** - `pnpm update @jetdevs/saas-core`
3. **Run migrations** - `pnpm saas db:migrate`
4. **Regenerate types** - `pnpm saas generate:types`
5. **Fix breaking changes** - Address any API changes
6. **Test** - Run test suite

### Migration Support

Core provides migration helpers for major version upgrades:

```typescript
// packages/saas-core/src/cli/commands/upgrade.ts

export async function upgrade(fromVersion: string, toVersion: string) {
  const migrations = getUpgradeMigrations(fromVersion, toVersion)

  for (const migration of migrations) {
    console.log(`Running migration: ${migration.name}`)
    await migration.up()
  }
}
```

## Testing Strategy

### Core Tests (in `packages/saas-core`)

```
packages/saas-core/
├── __tests__/
│   ├── unit/
│   │   ├── permissions.test.ts
│   │   ├── rbac.test.ts
│   │   └── rls.test.ts
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── trpc.test.ts
│   │   └── db.test.ts
│   └── e2e/
│       └── full-flow.test.ts
```

### App Tests (in `apps/my-saas`)

```
apps/my-saas/
├── __tests__/
│   ├── extensions/
│   │   ├── projects.test.ts
│   │   └── invoices.test.ts
│   ├── integration/
│   │   └── api.test.ts
│   └── e2e/
│       └── user-flows.test.ts
```

## Build & Publish

### Package Build (`packages/saas-core/package.json`)

```json
{
  "name": "@jetdevs/saas-core",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./db": {
      "types": "./dist/db/index.d.ts",
      "import": "./dist/db/index.js"
    },
    "./db/schema": {
      "types": "./dist/db/schema/index.d.ts",
      "import": "./dist/db/schema/index.js"
    },
    "./auth": {
      "types": "./dist/auth/index.d.ts",
      "import": "./dist/auth/index.js"
    },
    "./trpc": {
      "types": "./dist/trpc/index.d.ts",
      "import": "./dist/trpc/index.js"
    },
    "./ui": {
      "types": "./dist/ui/index.d.ts",
      "import": "./dist/ui/index.js"
    },
    "./hooks": {
      "types": "./dist/hooks/index.d.ts",
      "import": "./dist/hooks/index.js"
    },
    "./cli": {
      "types": "./dist/cli/index.d.ts",
      "import": "./dist/cli/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsup src/index.ts --format esm --dts --watch",
    "test": "vitest",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "next": "^15.0.0",
    "react": "^18.0.0 || ^19.0.0",
    "drizzle-orm": "^0.30.0",
    "@trpc/server": "^11.0.0"
  }
}
```

## Workspace Configuration

### `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

### Root `package.json`

```json
{
  "name": "yobo-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "typecheck": "turbo typecheck"
  },
  "devDependencies": {
    "turbo": "^2.0.0"
  }
}
```

## Summary

This architecture provides:

1. **Clear boundaries** - Core package vs application code
2. **Extension system** - Self-contained feature modules
3. **Type safety** - Full TypeScript across boundaries
4. **Upgradability** - Versioned core with explicit upgrade path
5. **Flexibility** - Configure behavior without modifying core
6. **Scalability** - Multiple apps sharing same core
