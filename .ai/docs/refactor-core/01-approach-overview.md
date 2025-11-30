# Core/Extension Architecture Refactor

## Executive Summary

This document outlines the approach for restructuring saas-core-v2 into a **Core Framework** that can be upgraded independently from **Extensions** (application-specific code). This mirrors patterns used by Magento, WordPress, and Laravel - where the framework evolves separately from customizations.

## Current State Analysis

### Architecture Breakdown

| Category | Current % | Files/Modules |
|----------|-----------|---------------|
| Framework Code | ~70% | Permissions, Auth, RBAC, DB Schema, Base UI |
| Application Code | ~30% | Feature pages, Custom routers, Business logic |

### What Belongs in Core (Framework)

1. **Permission System** - Registry, validation, types
2. **Authentication** - NextAuth config, session management
3. **Database Foundation** - Schema for orgs, users, roles, permissions, audit
4. **RBAC Engine** - Role/permission assignment logic
5. **Multi-Tenancy** - RLS policies, org context management
6. **tRPC Infrastructure** - Context, middleware, router factory
7. **UI Primitives** - Shadcn/ui components, data tables
8. **Framework Hooks** - useTable, usePermissionCheck, useAuthSession
9. **State Management** - Auth store, UI store foundations
10. **Scripts & Tooling** - Migration, seeding, RLS deployment

### What Belongs in Extensions (Application)

1. **Feature Routers** - Domain-specific tRPC procedures
2. **Feature Pages** - Next.js routes for specific functionality
3. **Feature Components** - UI specific to business domain
4. **Domain Services** - Business logic
5. **Extended Schema** - Tables beyond core (your features)
6. **Custom Permissions** - Permissions for your features
7. **Theme Customization** - Brand-specific styling
8. **Integration Endpoints** - Webhooks, external APIs

## Recommended Architecture

### Option A: Monorepo with Packages (Recommended)

```
monorepo/
├── packages/
│   └── saas-core/                 # Published/versioned core
│       ├── src/
│       │   ├── auth/              # Authentication
│       │   ├── db/                # Base schemas
│       │   ├── permissions/       # Permission system
│       │   ├── rbac/              # Role management
│       │   ├── trpc/              # tRPC infrastructure
│       │   ├── ui/                # Base UI components
│       │   ├── hooks/             # Framework hooks
│       │   ├── stores/            # State management
│       │   └── scripts/           # CLI tools
│       ├── package.json
│       └── CHANGELOG.md
│
├── apps/
│   └── my-saas-app/               # Your application
│       ├── src/
│       │   ├── app/               # Next.js pages
│       │   ├── features/          # Feature modules
│       │   ├── components/        # App-specific components
│       │   ├── server/            # App routers & services
│       │   └── extensions/        # Extension modules
│       ├── saas.config.ts         # Core configuration
│       └── package.json           # Depends on @saas-core
│
└── package.json                   # Workspace root
```

**Pros:**
- Clear separation between core and app
- Version core independently (semver)
- Multiple apps can share core
- Upgrade path is explicit (`pnpm update @saas-core`)

**Cons:**
- More complex initial setup
- Need to publish/link packages during development

### Option B: Convention-Based Separation (Simpler)

```
saas-app/
├── core/                          # Protected core (DO NOT MODIFY)
│   ├── auth/
│   ├── db/
│   │   └── schema/
│   │       ├── _core/             # Core tables (protected)
│   │       └── extensions/        # Extended tables
│   ├── permissions/
│   │   ├── registry-core.ts       # Core permissions (protected)
│   │   └── registry-extensions.ts # Your permissions
│   ├── rbac/
│   ├── trpc/
│   ├── ui/
│   ├── hooks/
│   └── scripts/
│
├── extensions/                    # Your customizations
│   ├── features/
│   │   └── [feature-name]/
│   │       ├── schema.ts
│   │       ├── router.ts
│   │       ├── service.ts
│   │       ├── permissions.ts
│   │       └── components/
│   └── config/
│
├── app/                           # Next.js app (mostly generated)
│   ├── (core)/                    # Core routes (protected)
│   └── (features)/                # Your feature routes
│
└── saas.config.ts                 # Extension points
```

**Pros:**
- Simpler to implement
- Single codebase
- Easier debugging

**Cons:**
- Requires discipline not to modify core
- Upgrade means replacing core/ directory
- Less explicit boundaries

### Option C: Hybrid (Best of Both)

```
monorepo/
├── packages/
│   └── @yobo/saas-core/           # Core as workspace package
│       └── ...
│
├── apps/
│   └── my-app/
│       ├── src/
│       │   ├── core/              # Symlink or re-exports from @yobo/saas-core
│       │   ├── extensions/
│       │   └── app/
│       └── package.json
│
└── pnpm-workspace.yaml
```

This approach:
- Core lives in `packages/` as a proper package
- Apps link to it via workspace protocol
- Extension pattern still applies within apps
- Can eventually publish core to npm

## Recommended Approach: Option A (Monorepo with Packages)

For a production SaaS platform that will spawn multiple projects, **Option A** provides:

1. **Explicit versioning** - Know exactly which core version each app uses
2. **Independent upgrades** - Upgrade core without touching app code
3. **Multiple apps** - Share core across merchant portal, admin, etc.
4. **CI/CD clarity** - Test core changes across all apps
5. **Type safety** - TypeScript boundaries between core and app

## Key Design Principles

### 1. Extension Points Over Modification

Core should expose **extension points** rather than requiring modification:

```typescript
// BAD: Modifying core permission registry
// core/permissions/registry.ts
export const permissions = {
  admin: { /* ... */ },
  myFeature: { /* added here - breaks upgrades */ }
}

// GOOD: Extension point
// core/permissions/registry.ts
export const corePermissions = { admin: { /* ... */ } }
export const createPermissionRegistry = (extensions: PermissionModule[]) => {
  return { ...corePermissions, ...mergeExtensions(extensions) }
}

// app/permissions/index.ts
import { createPermissionRegistry, corePermissions } from '@saas-core'
import { myFeaturePermissions } from './my-feature'
export const permissions = createPermissionRegistry([myFeaturePermissions])
```

### 2. Configuration Over Code

Core behavior should be configurable:

```typescript
// saas.config.ts
import { defineSaasConfig } from '@yobo/saas-core'

export default defineSaasConfig({
  auth: {
    providers: ['credentials', 'google'],
    sessionStrategy: 'jwt',
    passwordPolicy: { minLength: 12 }
  },
  permissions: {
    extensions: ['./extensions/*/permissions.ts'],
    autoSync: true
  },
  database: {
    schemas: ['./extensions/*/schema.ts'],
    rlsEnabled: true
  },
  ui: {
    theme: './themes/brand.ts',
    sidebar: {
      items: './config/navigation.ts'
    }
  }
})
```

### 3. Hooks for Lifecycle Events

Core should emit events that extensions can hook into:

```typescript
// Extension hooking into user creation
import { hooks } from '@yobo/saas-core'

hooks.on('user:created', async (user, context) => {
  await myFeatureService.initializeForUser(user.id)
})

hooks.on('org:created', async (org, context) => {
  await setupDefaultWorkspaces(org.id)
})
```

### 4. Schema Extension Pattern

Extensions add tables without modifying core:

```typescript
// extensions/projects/schema.ts
import { pgTable, text, uuid, timestamp } from 'drizzle-orm/pg-core'
import { users, orgs } from '@yobo/saas-core/db'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull().references(() => orgs.id),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

// Auto-registered for RLS via convention
```

### 5. Router Composition

Routers are composed, not modified:

```typescript
// app/server/api/root.ts
import { coreRouter } from '@yobo/saas-core/trpc'
import { projectsRouter } from '@/extensions/projects/router'
import { invoicesRouter } from '@/extensions/invoices/router'

export const appRouter = coreRouter.merge({
  projects: projectsRouter,
  invoices: invoicesRouter,
})
```

## Migration Strategy

### Phase 1: Identify & Extract (Week 1-2)
- Audit all files, categorize as core vs app
- Create package structure
- Move core code to `packages/saas-core`

### Phase 2: Create Extension Points (Week 2-3)
- Define configuration schema
- Create permission extension system
- Create schema extension system
- Create router composition system

### Phase 3: Migrate Application Code (Week 3-4)
- Move feature code to extensions
- Wire up extension points
- Validate functionality

### Phase 4: Documentation & Tooling (Week 4)
- Document extension development
- Create CLI for scaffolding extensions
- Write upgrade guide

## Success Criteria

1. **Core is untouched during feature development** - Adding a feature never modifies `packages/saas-core`
2. **Upgrade is non-breaking** - `pnpm update @saas-core` works without code changes (within major version)
3. **Extensions are self-contained** - Each feature module contains all its code
4. **Type safety preserved** - Full TypeScript coverage across boundary
5. **Testing isolation** - Core tests pass independently of app tests

## Next Steps

1. Review and approve this approach
2. Proceed to detailed architecture plan (02-architecture-plan.md)
3. Follow migration guide (03-migration-guide.md)
4. Reference extension development guide (04-extension-guide.md)
