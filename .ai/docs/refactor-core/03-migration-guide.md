# Migration Guide: saas-core-v2 to Core/Extension Architecture

This guide provides step-by-step instructions for migrating the current saas-core-v2 codebase to the new core/extension architecture.

## Prerequisites

- Node.js ≥ 18.17.0
- pnpm ≥ 8.0.0
- Git repository with all changes committed
- Database backup (recommended)

## Overview

The migration is divided into 4 phases:

| Phase | Description | Est. Effort |
|-------|-------------|-------------|
| 1 | Setup monorepo structure | Foundation |
| 2 | Extract core package | Core extraction |
| 3 | Create extension system | Extension infrastructure |
| 4 | Migrate application code | App restructuring |

---

## Phase 1: Setup Monorepo Structure

### Step 1.1: Initialize Workspace

```bash
# From monorepo root
mkdir -p packages/saas-core
mkdir -p apps/saas-app

# Initialize workspace
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'packages/*'
  - 'apps/*'
EOF

# Install turbo for build orchestration
pnpm add -D turbo -w
```

### Step 1.2: Create Turbo Config

```bash
cat > turbo.json << 'EOF'
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
EOF
```

### Step 1.3: Initialize Core Package

```bash
cd packages/saas-core

cat > package.json << 'EOF'
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
    "./permissions": {
      "types": "./dist/permissions/index.d.ts",
      "import": "./dist/permissions/index.js"
    },
    "./ui": {
      "types": "./dist/ui/index.d.ts",
      "import": "./dist/ui/index.js"
    },
    "./hooks": {
      "types": "./dist/hooks/index.d.ts",
      "import": "./dist/hooks/index.js"
    },
    "./stores": {
      "types": "./dist/stores/index.d.ts",
      "import": "./dist/stores/index.js"
    },
    "./providers": {
      "types": "./dist/providers/index.d.ts",
      "import": "./dist/providers/index.js"
    },
    "./lib": {
      "types": "./dist/lib/index.d.ts",
      "import": "./dist/lib/index.js"
    },
    "./rls": {
      "types": "./dist/rls/index.d.ts",
      "import": "./dist/rls/index.js"
    },
    "./cli": {
      "types": "./dist/cli/index.d.ts",
      "import": "./dist/cli/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
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
EOF
```

### Step 1.4: Create Build Config

```bash
# packages/saas-core/tsup.config.ts
cat > tsup.config.ts << 'EOF'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'db/index': 'src/db/index.ts',
    'db/schema/index': 'src/db/schema/index.ts',
    'auth/index': 'src/auth/index.ts',
    'trpc/index': 'src/trpc/index.ts',
    'permissions/index': 'src/permissions/index.ts',
    'ui/index': 'src/ui/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'stores/index': 'src/stores/index.ts',
    'providers/index': 'src/providers/index.ts',
    'lib/index': 'src/lib/index.ts',
    'rls/index': 'src/rls/index.ts',
    'cli/index': 'src/cli/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'next', 'drizzle-orm', '@trpc/server'],
})
EOF
```

---

## Phase 2: Extract Core Package

### Step 2.1: Create Core Directory Structure

```bash
cd packages/saas-core
mkdir -p src/{auth,db/schema,db/seeds,permissions,rbac,rls,trpc/routers,ui/primitives,ui/data-table,ui/layout,ui/auth,ui/theme,hooks,stores,providers,lib,config,cli/commands}
```

### Step 2.2: Move Permission System

```bash
# From saas-core-v2 to packages/saas-core

# Copy core files
cp saas-core-v2/src/permissions/registry.ts packages/saas-core/src/permissions/
cp saas-core-v2/src/permissions/types.ts packages/saas-core/src/permissions/
cp saas-core-v2/src/permissions/validator.ts packages/saas-core/src/permissions/
```

Create the permission merger:

> **IMPORTANT**: Permission collisions are **fatal by default**. Extensions cannot
> override core permissions unless explicitly opted in with `allowOverride: true`.

```typescript
// packages/saas-core/src/permissions/merger.ts

import type { PermissionModule, PermissionRegistry } from './types'

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

Create permission index:

```typescript
// packages/saas-core/src/permissions/index.ts

export { corePermissions } from './registry'
export { mergePermissions } from './merger'
export { validatePermissions } from './validator'
export type * from './types'
```

### Step 2.3: Move Database Schema

```bash
# Copy schema files
cp saas-core-v2/src/db/schema/org.ts packages/saas-core/src/db/schema/orgs.ts
cp saas-core-v2/src/db/schema/rbac.ts packages/saas-core/src/db/schema/
cp saas-core-v2/src/db/schema/audit.ts packages/saas-core/src/db/schema/
cp saas-core-v2/src/db/schema/auth-accounts.ts packages/saas-core/src/db/schema/auth.ts
cp saas-core-v2/src/db/schema/theme.ts packages/saas-core/src/db/schema/themes.ts
cp saas-core-v2/src/db/schema/system-config.ts packages/saas-core/src/db/schema/system.ts
cp saas-core-v2/src/db/schema/feature-flags.ts packages/saas-core/src/db/schema/
cp saas-core-v2/src/db/schema/api-keys.ts packages/saas-core/src/db/schema/api.ts
```

Create schema aggregator:

```typescript
// packages/saas-core/src/db/schema/index.ts

export * from './orgs'
export * from './users'
export * from './rbac'
export * from './audit'
export * from './auth'
export * from './themes'
export * from './system'
export * from './api'
```

Create database client factory:

```typescript
// packages/saas-core/src/db/client.ts

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export interface DbConfig {
  url: string
  maxConnections?: number
  ssl?: boolean
}

export function createDbClient(config: DbConfig) {
  const client = postgres(config.url, {
    max: config.maxConnections ?? 10,
    ssl: config.ssl ?? process.env.NODE_ENV === 'production',
  })

  return drizzle(client, { schema })
}

export type DbClient = ReturnType<typeof createDbClient>
```

Create database index:

```typescript
// packages/saas-core/src/db/index.ts

export { createDbClient } from './client'
export type { DbClient, DbConfig } from './client'
export * as schema from './schema'
```

### Step 2.4: Move Authentication

```bash
cp saas-core-v2/src/server/auth/auth-simple.ts packages/saas-core/src/auth/config.ts
cp -r saas-core-v2/src/server/auth/providers packages/saas-core/src/auth/
```

Create auth factory:

```typescript
// packages/saas-core/src/auth/index.ts

import type { NextAuthConfig } from 'next-auth'
import type { SaasAuthConfig } from '../config/types'

export function createAuthConfig(config: SaasAuthConfig): NextAuthConfig {
  return {
    providers: config.providers.map(p => resolveProvider(p)),
    session: {
      strategy: config.session?.strategy ?? 'jwt',
      maxAge: config.session?.maxAge ?? 30 * 24 * 60 * 60,
    },
    pages: config.pages ?? {
      signIn: '/login',
      signUp: '/register',
    },
    callbacks: {
      session: async ({ session, token }) => {
        // Inject user data
        if (token?.sub) {
          session.user.id = token.sub
        }
        // Run custom callback if provided
        if (config.callbacks?.session) {
          return config.callbacks.session({ session, token })
        }
        return session
      },
      jwt: async ({ token, user }) => {
        if (user) {
          token.sub = user.id
        }
        if (config.callbacks?.jwt) {
          return config.callbacks.jwt({ token, user })
        }
        return token
      },
    },
  }
}

function resolveProvider(name: string) {
  // Map provider names to NextAuth providers
  switch (name) {
    case 'google':
      return GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      })
    case 'github':
      return GitHubProvider({
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      })
    case 'credentials':
      return CredentialsProvider({
        // Default credentials config
      })
    default:
      throw new Error(`Unknown auth provider: ${name}`)
  }
}

export { getServerSession } from 'next-auth'
```

### Step 2.5: Move tRPC Infrastructure

```bash
cp saas-core-v2/src/server/api/trpc.ts packages/saas-core/src/trpc/context.ts
```

Create router factory:

```typescript
// packages/saas-core/src/trpc/router-factory.ts

import { initTRPC, TRPCError } from '@trpc/server'
import type { TRPCContext } from './context'
import type { PermissionKey } from '../permissions'

const t = initTRPC.context<TRPCContext>().create()

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' })
  }
  return next({
    ctx: {
      ...ctx,
      session: ctx.session,
    },
  })
})

export const permissionProcedure = (permission: PermissionKey) =>
  protectedProcedure.use(async ({ ctx, next }) => {
    const hasPermission = ctx.actor?.permissions.includes(permission)
    if (!hasPermission) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Missing permission: ${permission}`,
      })
    }
    return next({ ctx })
  })

// High-level router factory for extensions
export interface RouterConfig<T> {
  [key: string]: {
    type: 'query' | 'mutation'
    permission?: PermissionKey
    input?: z.ZodSchema
    handler: (opts: { input: T; ctx: TRPCContext }) => Promise<unknown>
  }
}

export function createRouterWithActor<T extends RouterConfig<any>>(config: T) {
  const procedures: Record<string, any> = {}

  for (const [name, def] of Object.entries(config)) {
    const baseProcedure = def.permission
      ? permissionProcedure(def.permission)
      : protectedProcedure

    const withInput = def.input
      ? baseProcedure.input(def.input)
      : baseProcedure

    procedures[name] = def.type === 'query'
      ? withInput.query(def.handler)
      : withInput.mutation(def.handler)
  }

  return router(procedures)
}
```

Move core routers:

```bash
cp saas-core-v2/src/server/api/routers/auth.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/user.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/role.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/permission.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/org.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/theme.router.ts packages/saas-core/src/trpc/routers/
cp saas-core-v2/src/server/api/routers/system-config.router.ts packages/saas-core/src/trpc/routers/
```

Create core router aggregator:

```typescript
// packages/saas-core/src/trpc/routers/index.ts

import { router } from '../router-factory'
import { authRouter } from './auth.router'
import { userRouter } from './user.router'
import { roleRouter } from './role.router'
import { permissionRouter } from './permission.router'
import { orgRouter } from './org.router'
import { themeRouter } from './theme.router'
import { systemRouter } from './system-config.router'

export const coreRouter = router({
  auth: authRouter,
  user: userRouter,
  role: roleRouter,
  permission: permissionRouter,
  org: orgRouter,
  theme: themeRouter,
  system: systemRouter,
})

export type CoreRouter = typeof coreRouter
```

Create tRPC index:

```typescript
// packages/saas-core/src/trpc/index.ts

export { createTRPCContext } from './context'
export type { TRPCContext, Actor } from './context'

export {
  router,
  publicProcedure,
  protectedProcedure,
  permissionProcedure,
  createRouterWithActor,
} from './router-factory'

export { coreRouter } from './routers'
export type { CoreRouter } from './routers'
```

### Step 2.6: Move UI Components

```bash
# Shadcn primitives
cp -r saas-core-v2/src/components/ui/* packages/saas-core/src/ui/primitives/

# Data table
cp -r saas-core-v2/src/components/data-table/* packages/saas-core/src/ui/data-table/

# Layout
cp saas-core-v2/src/components/layout/AppSkeleton.tsx packages/saas-core/src/ui/layout/
cp saas-core-v2/src/components/Sidebar/Sidebar.tsx packages/saas-core/src/ui/layout/

# Auth UI
cp saas-core-v2/src/components/auth/auth-guard.tsx packages/saas-core/src/ui/auth/

# Theme
cp saas-core-v2/src/components/theme/* packages/saas-core/src/ui/theme/
```

Create UI index:

```typescript
// packages/saas-core/src/ui/index.ts

// Primitives
export * from './primitives'

// Data Table
export { DataTable } from './data-table/DataTable'
export type { DataTableProps } from './data-table/types'

// Layout
export { AppSkeleton } from './layout/AppSkeleton'
export { Sidebar } from './layout/Sidebar'

// Auth
export { AuthGuard } from './auth/auth-guard'

// Theme
export { ThemeSwitcher } from './theme/ThemeSwitcher'
```

### Step 2.7: Move Hooks

```bash
cp saas-core-v2/src/framework/hooks/useTable.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/useTableFilter.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/useTableSort.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/useAuthSession.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/usePermissionCheck.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/usePermissionContext.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/useSidebarStore.ts packages/saas-core/src/hooks/
cp saas-core-v2/src/framework/hooks/useModalState.ts packages/saas-core/src/hooks/
```

Create hooks index:

```typescript
// packages/saas-core/src/hooks/index.ts

export { useTable } from './useTable'
export { useTableFilter } from './useTableFilter'
export { useTableSort } from './useTableSort'
export { useAuthSession } from './useAuthSession'
export { usePermissionCheck } from './usePermissionCheck'
export { usePermissionContext } from './usePermissionContext'
export { useSidebarStore } from './useSidebarStore'
export { useModalState } from './useModalState'
```

### Step 2.8: Move Stores

```bash
cp saas-core-v2/src/framework/store/auth.store.ts packages/saas-core/src/stores/
cp saas-core-v2/src/framework/store/ui.store.ts packages/saas-core/src/stores/
```

Create stores index:

```typescript
// packages/saas-core/src/stores/index.ts

export { useAuthStore } from './auth.store'
export { useUIStore } from './ui.store'
```

### Step 2.9: Move Providers

```bash
cp saas-core-v2/src/components/providers/TRPCProvider.tsx packages/saas-core/src/providers/
cp saas-core-v2/src/framework/providers/* packages/saas-core/src/providers/
```

Create providers index:

```typescript
// packages/saas-core/src/providers/index.ts

export { TRPCProvider } from './TRPCProvider'
export { AuthProvider } from './AuthProvider'
export { ThemeProvider } from './ThemeProvider'
```

### Step 2.10: Move RLS System

```bash
cp saas-core-v2/scripts/rls-registry.ts packages/saas-core/src/rls/registry.ts
```

Create RLS utilities:

```typescript
// packages/saas-core/src/rls/index.ts

export { coreRlsTables, createRlsRegistry } from './registry'
export { deployRlsPolicies } from './deploy'
export { setRlsContext } from './context'
export type { RlsTableConfig } from './types'
```

### Step 2.11: Move Utilities

```bash
cp saas-core-v2/src/lib/utils.ts packages/saas-core/src/lib/
cp saas-core-v2/src/lib/logger.ts packages/saas-core/src/lib/
cp saas-core-v2/src/lib/generate-id.ts packages/saas-core/src/lib/
cp saas-core-v2/src/lib/rate-limit.ts packages/saas-core/src/lib/
```

Create lib index:

```typescript
// packages/saas-core/src/lib/index.ts

export { cn } from './utils'
export { logger } from './logger'
export { generateId } from './generate-id'
export { rateLimit } from './rate-limit'
```

### Step 2.12: Create Main Export

```typescript
// packages/saas-core/src/index.ts

// Configuration
export { defineSaasConfig } from './config'
export type { SaasConfig, Extension } from './config'

// Database
export { createDbClient } from './db'
export * as schema from './db/schema'
export type { DbClient } from './db'

// Authentication
export { createAuthConfig, getServerSession } from './auth'

// Permissions
export { corePermissions, mergePermissions, validatePermissions } from './permissions'
export type { Permission, PermissionModule, PermissionKey } from './permissions'

// RBAC
export { RbacService } from './rbac'

// RLS
export { createRlsRegistry, deployRlsPolicies, setRlsContext } from './rls'

// tRPC
export {
  createTRPCContext,
  createRouterWithActor,
  protectedProcedure,
  publicProcedure,
  coreRouter,
} from './trpc'
export type { TRPCContext, Actor } from './trpc'

// UI Components
export * from './ui'

// Hooks
export * from './hooks'

// Stores
export * from './stores'

// Providers
export * from './providers'

// Utilities
export { cn, generateId, logger } from './lib'
```

---

## Phase 3: Create Extension System

### Step 3.1: Define Configuration Schema

```typescript
// packages/saas-core/src/config/schema.ts

import { z } from 'zod'

export const extensionSchema = z.object({
  name: z.string(),
  version: z.string(),
  schema: z.record(z.any()).optional(),
  permissions: z.any().optional(),
  router: z.any().optional(),
  rls: z.array(z.any()).optional(),
  hooks: z.object({
    onInstall: z.function().optional(),
    onEnable: z.function().optional(),
    onDisable: z.function().optional(),
  }).optional(),
  seeds: z.function().optional(),
})

export const saasConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string().optional(),
  }),

  auth: z.object({
    providers: z.array(z.string()),
    session: z.object({
      strategy: z.enum(['jwt', 'database']).default('jwt'),
      maxAge: z.number().optional(),
    }).optional(),
    pages: z.object({
      signIn: z.string().optional(),
      signUp: z.string().optional(),
      error: z.string().optional(),
    }).optional(),
    callbacks: z.any().optional(),
  }),

  database: z.object({
    url: z.string(),
    adminUrl: z.string().optional(),
    migrationsPath: z.string().default('./drizzle'),
    rls: z.object({
      enabled: z.boolean().default(true),
      contextVar: z.string().default('rls.current_org_id'),
    }).optional(),
  }),

  permissions: z.object({
    autoSync: z.boolean().default(true),
  }).optional(),

  extensions: z.array(extensionSchema),

  ui: z.object({
    theme: z.object({
      defaultTheme: z.enum(['light', 'dark', 'system']).default('system'),
      brandColor: z.string().optional(),
    }).optional(),
    sidebar: z.object({
      configPath: z.string().optional(),
    }).optional(),
  }).optional(),

  features: z.object({
    multiTenant: z.boolean().default(true),
    auditLog: z.boolean().default(true),
    apiKeys: z.boolean().default(false),
    themes: z.boolean().default(true),
  }).optional(),

  hooks: z.record(z.function()).optional(),
})

export type SaasConfig = z.infer<typeof saasConfigSchema>
export type Extension = z.infer<typeof extensionSchema>
```

### Step 3.2: Create Config Loader

```typescript
// packages/saas-core/src/config/index.ts

import { saasConfigSchema, type SaasConfig, type Extension } from './schema'

export function defineSaasConfig(config: SaasConfig): SaasConfig {
  const validated = saasConfigSchema.parse(config)
  return validated
}

export function defineExtension(ext: Extension): Extension {
  return ext
}

export type { SaasConfig, Extension }
```

### Step 3.3: Create Extension Loader

```typescript
// packages/saas-core/src/config/extension-loader.ts

import type { SaasConfig, Extension } from './schema'
import { mergePermissions, corePermissions } from '../permissions'
import { createRlsRegistry, coreRlsTables } from '../rls'
import { router } from '../trpc'

export interface LoadedExtensions {
  permissions: ReturnType<typeof mergePermissions>
  rls: ReturnType<typeof createRlsRegistry>
  router: ReturnType<typeof router>
  schema: Record<string, any>
}

export function loadExtensions(config: SaasConfig): LoadedExtensions {
  const extensions = config.extensions || []

  // Merge permissions (strict mode - collisions are fatal)
  const extensionPermissions = extensions
    .filter(ext => ext.permissions)
    .map(ext => ext.permissions!)
  const permissions = mergePermissions(corePermissions, extensionPermissions, { strict: true })

  // Merge RLS configs
  const extensionRls = extensions.flatMap(ext => ext.rls || [])
  const rls = createRlsRegistry([...coreRlsTables, ...extensionRls])

  // Compose routers
  const extensionRouters = extensions.reduce((acc, ext) => {
    if (ext.router) {
      acc[ext.name] = ext.router
    }
    return acc
  }, {} as Record<string, any>)
  const composedRouter = router(extensionRouters)

  // Merge schemas
  const schema = extensions.reduce((acc, ext) => {
    if (ext.schema) {
      Object.assign(acc, ext.schema)
    }
    return acc
  }, {} as Record<string, any>)

  return {
    permissions,
    rls,
    router: composedRouter,
    schema,
  }
}
```

---

## Phase 4: Migrate Application Code

### Step 4.1: Initialize Application

```bash
cd apps/saas-app

# Copy existing app structure
cp -r ../../saas-core-v2/src/app .
cp -r ../../saas-core-v2/public .
cp ../../saas-core-v2/next.config.mjs .
cp ../../saas-core-v2/tailwind.config.ts .
cp ../../saas-core-v2/tsconfig.json .

# Initialize package.json
cat > package.json << 'EOF'
{
  "name": "@jetdevs/saas-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest",
    "db:migrate": "drizzle-kit migrate",
    "db:generate": "drizzle-kit generate",
    "saas": "saas-cli"
  },
  "dependencies": {
    "@jetdevs/saas-core": "workspace:*",
    "next": "^15.1.1",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
EOF

pnpm install
```

### Step 4.2: Create Application Config

```typescript
// apps/saas-app/saas.config.ts

import { defineSaasConfig } from '@jetdevs/saas-core'
// Import your extensions (if any)
// import { projectsExtension } from './src/extensions/projects'

export default defineSaasConfig({
  app: {
    name: 'My SaaS App',
    version: '1.0.0',
  },

  auth: {
    providers: ['credentials', 'google'],
    session: {
      strategy: 'jwt',
      maxAge: 30 * 24 * 60 * 60,
    },
    pages: {
      signIn: '/login',
      signUp: '/register',
    },
  },

  database: {
    url: process.env.DATABASE_URL!,
    adminUrl: process.env.ADMIN_DATABASE_URL,
    migrationsPath: './drizzle',
    rls: {
      enabled: true,
    },
  },

  permissions: {
    autoSync: true,
  },

  // Add your extensions here
  extensions: [
    // projectsExtension,
  ],

  ui: {
    theme: {
      defaultTheme: 'system',
    },
  },

  features: {
    multiTenant: true,
    auditLog: true,
    apiKeys: true,
    themes: true,
  },
})
```

### Step 4.3: Update tRPC Root Router

> **IMPORTANT**: Use `composeRouters()` - do NOT use `_def.procedures` or `.merge()`.

```typescript
// apps/saas-app/src/server/api/root.ts

import { coreRouter, composeRouters } from '@jetdevs/saas-core/trpc'
import config from '../../../saas.config'

// Collect extension routers
const extensionRouters = config.extensions
  .filter(ext => ext.router)
  .map(ext => ({ name: ext.name, router: ext.router! }))

// Compose using the sanctioned helper (preserves middleware)
export const appRouter = composeRouters(coreRouter, extensionRouters)

export type AppRouter = typeof appRouter
```

### Step 4.4: Update Auth Configuration

```typescript
// apps/saas-app/src/server/auth/config.ts

import { createAuthConfig } from '@jetdevs/saas-core/auth'
import config from '../../../saas.config'

export const authConfig = createAuthConfig(config.auth)
```

### Step 4.5: Update Database Client

```typescript
// apps/saas-app/src/db/index.ts

import { createDbClient, schema as coreSchema } from '@jetdevs/saas-core/db'
import { loadExtensions } from '@jetdevs/saas-core/config'
import config from '../../saas.config'

const { schema: extensionSchema } = loadExtensions(config)

// Merged schema
export const schema = {
  ...coreSchema,
  ...extensionSchema,
}

// Database client
export const db = createDbClient({
  url: config.database.url,
})
```

### Step 4.6: Update Imports Throughout App

Replace old imports with new package imports:

```typescript
// Before
import { usePermissionCheck } from '@/framework/hooks/usePermissionCheck'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/data-table/DataTable'

// After
import { usePermissionCheck, Button, DataTable } from '@jetdevs/saas-core'
// Or more specific imports
import { usePermissionCheck } from '@jetdevs/saas-core/hooks'
import { Button } from '@jetdevs/saas-core/ui'
```

### Step 4.7: Create First Extension (Optional)

```bash
mkdir -p apps/saas-app/src/extensions/projects
```

```typescript
// apps/saas-app/src/extensions/projects/index.ts

import { defineExtension } from '@jetdevs/saas-core'
import * as schema from './schema'
import { permissions } from './permissions'
import { projectsRouter } from './router'

export const projectsExtension = defineExtension({
  name: 'projects',
  version: '1.0.0',
  schema,
  permissions,
  router: projectsRouter,
  rls: [
    { tableName: 'projects', orgIdColumn: 'org_id' },
  ],
})
```

---

## Database Migration Strategy

> **CRITICAL**: Core and extension migrations are separated into **lanes**.
> Core migrations MUST run before extension migrations. Never mix them.

### Migration Lane Architecture

```
packages/saas-core/
├── migrations/                    # Core migrations (versioned with package)
│   ├── 0001_initial_schema.sql
│   ├── 0002_add_audit_logs.sql
│   └── meta/
│       └── _journal.json

apps/my-saas/
├── drizzle/                       # App-level migrations
│   ├── extensions/                # Extension migrations (separate lane)
│   │   ├── projects/
│   │   │   ├── 0001_projects_table.sql
│   │   │   └── meta/_journal.json
│   │   └── invoices/
│   │       ├── 0001_invoices_table.sql
│   │       └── meta/_journal.json
│   └── app/                       # App-specific migrations (if any)
│       └── 0001_custom_tables.sql
```

### Lane Execution Order

```
1. Core migrations     (packages/saas-core/migrations)
2. Extension migrations (apps/my-saas/drizzle/extensions/*)
3. App migrations      (apps/my-saas/drizzle/app) [optional]
```

### Migration Orchestrator

The CLI provides an orchestrator that enforces proper ordering:

```typescript
// packages/saas-core/src/cli/commands/db-migrate.ts

export async function migrateAll(options: MigrateOptions = {}) {
  const { dryRun = false, force = false } = options

  // Track state per lane
  const state = await loadMigrationState()

  // 1. Run core migrations first
  console.log('Running core migrations...')
  await runCoreMigrations({ dryRun })
  state.core = await getCoreMigrationVersion()

  // 2. Run extension migrations (in registration order)
  for (const ext of config.extensions) {
    if (ext.schema) {
      console.log(`Running migrations for extension: ${ext.name}`)
      const extMigrationPath = `drizzle/extensions/${ext.name}`
      if (existsSync(extMigrationPath)) {
        await runMigrations(extMigrationPath, { dryRun })
        state.extensions[ext.name] = await getExtMigrationVersion(ext.name)
      }
    }
  }

  // 3. Run app migrations (optional)
  if (existsSync('drizzle/app')) {
    console.log('Running app migrations...')
    await runMigrations('drizzle/app', { dryRun })
    state.app = await getAppMigrationVersion()
  }

  await saveMigrationState(state)
  console.log('All migrations complete!')
}
```

### Migration State Tracking

State is tracked in the database per lane:

```sql
CREATE TABLE IF NOT EXISTS __drizzle_migrations_state (
  lane TEXT PRIMARY KEY,           -- 'core', 'ext:projects', 'app'
  version TEXT NOT NULL,           -- Last applied migration
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT                    -- For drift detection
);
```

### Generating Extension Migrations

```bash
# Generate migration for a specific extension
pnpm saas migrate:generate --extension projects

# This creates:
# drizzle/extensions/projects/0002_new_migration.sql
```

### Rollback Support

Each lane can be rolled back independently:

```bash
# Rollback core to specific version
pnpm saas migrate:rollback --lane core --to 0001

# Rollback extension
pnpm saas migrate:rollback --lane ext:projects --to 0001

# Rollback all (in reverse order: app -> extensions -> core)
pnpm saas migrate:rollback --all --to-state <state-id>
```

### Core Version Upgrades

When upgrading `@jetdevs/saas-core`:

1. Core package ships new migrations
2. `pnpm saas migrate` detects pending core migrations
3. Runs core migrations first, then extension migrations
4. Reports any breaking changes

```bash
# After pnpm update @jetdevs/saas-core
pnpm saas migrate

# Output:
# ✓ Core migrations: 0005 → 0007 (2 pending)
# ✓ Extension 'projects': up to date
# ✓ Extension 'invoices': up to date
# Applied 2 core migrations successfully
```

### Idempotency Requirements

All migrations MUST be idempotent:

```sql
-- ✅ GOOD: Idempotent
CREATE TABLE IF NOT EXISTS projects (...);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'status'
  ) THEN
    ALTER TABLE projects ADD COLUMN status text DEFAULT 'active';
  END IF;
END $$;

-- ❌ BAD: Will fail on re-run
CREATE TABLE projects (...);
ALTER TABLE projects ADD COLUMN status text;
```

---

## RLS Context in tRPC Middleware

After migration, ensure RLS context is properly set. The core provides middleware:

```typescript
// apps/my-saas/src/server/api/trpc.ts

import { createTRPCContext, setRlsContext, clearRlsContext } from '@jetdevs/saas-core'

export const createContext = async (opts: CreateContextOptions) => {
  const baseContext = await createTRPCContext(opts)

  // RLS context is set automatically by protectedProcedure middleware
  // But if you need manual control:
  return {
    ...baseContext,
    setRlsContext: () => setRlsContext(baseContext.db, baseContext.session.user.orgId),
    clearRlsContext: () => clearRlsContext(baseContext.db),
  }
}
```

---

## Post-Migration Checklist

### Verify Core Package

- [ ] `pnpm build` succeeds in `packages/saas-core`
- [ ] All exports work correctly
- [ ] TypeScript types are generated

### Verify Application

- [ ] `pnpm dev` starts without errors
- [ ] Authentication works
- [ ] Permission checks work
- [ ] Database queries work
- [ ] UI components render correctly

### Test Extensions

- [ ] Extension schema loads
- [ ] Extension permissions merge
- [ ] Extension router works
- [ ] RLS policies deploy

### Documentation

- [ ] Update README with new structure
- [ ] Document extension creation process
- [ ] Update deployment scripts

---

## Rollback Plan

If migration fails:

1. Keep `saas-core-v2` intact during migration
2. Test thoroughly before removing old code
3. Use git branches for each phase
4. Database migrations are reversible

```bash
# Rollback to previous state
git checkout main -- saas-core-v2/
rm -rf packages/saas-core
rm -rf apps/saas-app
```

---

## Troubleshooting

### Common Issues

**Issue: Module not found**
- Ensure all exports are defined in package.json exports field
- Run `pnpm build` in core package
- Check tsconfig paths

**Issue: Type errors after migration**
- Regenerate types: `pnpm typecheck`
- Check import paths

**Issue: RLS not working**
- Verify `rls.current_org_id` is set in context
- Run `pnpm saas rls:deploy`

**Issue: Permissions not loading**
- Check permission registry merge
- Verify autoSync is enabled
- Check database connection
