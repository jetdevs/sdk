# @jetdevs/framework API Reference - Phase 3 Complete

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Router API - Phase 3](#router-api-phase-3)
3. [Database API](#database-api)
4. [Permissions API](#permissions-api)
5. [Auth API](#auth-api)
6. [Configuration](#configuration)
7. [Migration Guide](#migration-guide)

## Phase 3 SDK Status: ✅ COMPLETE (2025-11-12)

The Phase 3 SDK implementation is production-ready with:
- ✅ `createRouterWithActor` helper eliminating 31-50% boilerplate
- ✅ Auto-repository instantiation
- ✅ Three-tier cross-org access model
- ✅ Built-in telemetry and audit logging
- ✅ Full RLS safety maintained

---

## Installation & Setup

### Install the Package

```bash
pnpm add @jetdevs/framework
```

### Initial Configuration

The framework must be configured once during application startup:

```typescript
// src/server/api/framework-integration.ts
import {
  configureRouterFactory,
  configureDatabaseContext,
  configurePermissions
} from '@jetdevs/framework';

export function initializeFramework() {
  // Configure router factory
  configureRouterFactory({
    createRouter: yourTRPCRouter,
    createProtectedProcedure: (permission) => yourPermissionProcedure(permission),
    createPublicProcedure: () => yourPublicProcedure,
  });

  // Configure database context
  configureDatabaseContext({
    getDatabase: () => db,
    getOrgContext: (ctx) => ({
      orgId: ctx.session?.user?.currentOrgId,
      userId: ctx.session?.user?.id,
    }),
  });

  // Configure permissions
  configurePermissions({
    checkPermission: async (ctx, permission) => {
      return hasPermission(ctx.user, permission);
    },
    getPermissions: async (ctx) => {
      return ctx.user.permissions || [];
    },
    isSuperUser: async (ctx) => {
      return ctx.user.isSuperUser || false;
    },
  });
}

// Initialize on app startup
initializeFramework();
```

---

## Router API - Phase 3

### `createRouterWithActor(routes: RouterConfig): TRPCRouter` ✅ NEW

Creates a tRPC router with automatic actor/context setup, eliminating 31-50% of boilerplate code.

#### Key Features
- **Auto-instantiated repositories**: Specify `repository: RepositoryClass`
- **Enhanced service context**: Includes `userId` directly
- **Built-in telemetry**: Automatic performance tracking
- **Built-in audit**: Automatic audit logging for mutations
- **Three-tier cross-org access**: Secure multi-tenant queries

#### Route Definition

```typescript
interface RouteConfig<TInput, TOutput> {
  /** Permission required (e.g., 'product:read') */
  permission?: string;

  /** Input validation schema */
  input?: z.ZodType<TInput>;

  /** Repository class to auto-instantiate */
  repository?: new (db: Database) => Repository;

  /** Auto-validate result is not null (throws NOT_FOUND) */
  ensureResult?: boolean | { errorCode: string; message: string };

  /** Cache configuration for queries */
  cache?: {
    ttl?: number;
    tags?: string[];
  };

  /** Cache tags to invalidate for mutations */
  invalidates?: string[];

  /** Entity type for audit logging */
  entityType?: string;

  /** Handler function with simplified context */
  handler: (context: HandlerContext<TInput>) => Promise<TOutput>;
}

interface HandlerContext<TInput> {
  input: TInput;
  service: ServiceContext;  // Includes db, actor, orgId, userId
  repo?: Repository;         // Auto-instantiated if specified
  actor: Actor;             // For advanced checks
  db: Database;             // RLS-scoped database
  ctx: TRPCContext;         // Raw tRPC context
}
```

#### Example - Phase 3 Usage

```typescript
import { createRouterWithActor } from '@jetdevs/framework/router';
import { ProductsRepository } from '@/server/repos/products.repository';
import { z } from 'zod';

// One-time configuration in trpc.ts
import { configureActorAdapter } from '@jetdevs/framework/router';
configureActorAdapter({
  createActor,
  getDbContext,
  createServiceContext,
  getProcedure: (permission) =>
    permission
      ? orgProtectedProcedureWithPermission(permission)
      : orgProtectedProcedure,
  createTRPCRouter,
});

// Router implementation
export const productsRouter = createRouterWithActor({
  // Query with auto-instantiated repository
  list: {
    permission: 'product:read',
    input: listProductsSchema,
    cache: { ttl: 60, tags: ['products'] },
    repository: ProductsRepository,
    handler: async ({ input, service, repo }) => {
      // 6-7 lines of boilerplate eliminated!
      return repo.list({ ...input, orgId: service.orgId });
    },
  },

  // Mutation with auto-audit
  create: {
    permission: 'product:create',
    input: createProductSchema,
    invalidates: ['products'],
    repository: ProductsRepository,
    entityType: 'product',
    handler: async ({ input, service, repo }) => {
      // service.userId available directly
      return repo.create(input, service.orgId, service.userId);
    },
  },

  // Query with auto-validation
  getById: {
    permission: 'product:read',
    input: z.object({ id: z.string().uuid() }),
    repository: ProductsRepository,
    ensureResult: true,  // Auto-throws NOT_FOUND if null
    handler: async ({ input, service, repo }) => {
      return repo.getById(input.id, service.orgId);
    },
  },
});
```

### `createRouteGroup(basePermission: string, routes: RouterConfig)`

Creates a group of routes that share a base permission.

```typescript
const adminRoutes = createRouteGroup('admin:access', {
  listUsers: {
    // Inherits 'admin:access' permission
    handler: async (ctx) => userRepo.findMany(),
  },
  deleteUser: {
    permission: 'admin:delete', // Override base permission
    input: z.object({ id: z.number() }),
    handler: async (ctx, input) => userRepo.delete(input.id),
  },
});
```

### `configureRouterFactory(adapter: TRPCAdapter)`

Configures the router factory with your tRPC implementation.

```typescript
interface TRPCAdapter {
  createRouter: (procedures: any) => any;
  createProtectedProcedure: (permission: string) => any;
  createPublicProcedure?: () => any;
}
```

---

## Database API

### `createRepository(table: string, options: RepositoryOptions, db: Database)`

Creates a repository instance with automatic RLS enforcement.

#### Parameters

- `table`: Table name
- `options`: Repository configuration
- `db`: Database instance

#### Options

```typescript
interface RepositoryOptions {
  orgScoped?: boolean;        // Enable org-level RLS (default: true)
  workspaceScoped?: boolean;  // Enable workspace-level RLS
  softDelete?: boolean;       // Use soft deletes (default: false)
  orgColumn?: string;         // Org ID column name (default: 'org_id')
  workspaceColumn?: string;   // Workspace column (default: 'workspace_id')
}
```

#### Repository Methods

```typescript
interface Repository<T> {
  // Find multiple records
  findMany(filters?: BaseFilters): Promise<T[]>;

  // Find single record
  findById(id: number): Promise<T | null>;
  findByUuid(uuid: string): Promise<T | null>;
  findFirst(filters?: BaseFilters): Promise<T | null>;

  // Create record
  create(data: Partial<T>): Promise<T>;

  // Update records
  update(id: number, data: Partial<T>): Promise<T>;
  updateByUuid(uuid: string, data: Partial<T>): Promise<T>;

  // Delete records
  delete(id: number): Promise<boolean>;
  deleteByUuid(uuid: string): Promise<boolean>;

  // Count records
  count(filters?: BaseFilters): Promise<number>;

  // Check existence
  exists(filters?: BaseFilters): Promise<boolean>;
}
```

#### Example

```typescript
const campaignRepo = createRepository('campaigns', {
  orgScoped: true,
  softDelete: true,
}, ctx.db);

// Find all campaigns (automatically filtered by org)
const campaigns = await campaignRepo.findMany();

// Create with automatic org_id injection
const newCampaign = await campaignRepo.create({
  name: 'Summer Sale',
  status: 'draft',
});

// Soft delete
await campaignRepo.deleteByUuid(uuid);
```

### `withRLSContext(context: RLSContext, callback: () => Promise<T>)`

Executes code within an RLS context using AsyncLocalStorage.

```typescript
interface RLSContext {
  orgId?: number | null;
  workspaceId?: number | null;
  userId?: number | null;
}
```

#### Example

```typescript
await withRLSContext({ orgId: 123 }, async () => {
  // All database operations here will be scoped to org 123
  const products = await db.query.products.findMany();
});
```

### `configureDatabaseContext(config: DatabaseConfig)`

Configures database integration.

```typescript
interface DatabaseConfig {
  getDatabase: () => any;
  getOrgContext: (ctx: any) => RLSContext;
  setRLSContext?: (context: RLSContext) => Promise<any>;
}
```

---

## Permissions API

### `checkPermission(ctx: Context, permission: string, options?: CheckOptions)`

Checks if the current user has a specific permission.

#### Options

```typescript
interface CheckOptions {
  throwOnDenied?: boolean;     // Throw error if denied (default: true)
  errorMessage?: string;        // Custom error message
}
```

#### Example

```typescript
import { checkPermission } from '@jetdevs/framework/permissions';

// Check with exception
await checkPermission(ctx, 'product:delete');

// Check without exception
const canDelete = await checkPermission(ctx, 'product:delete', {
  throwOnDenied: false,
});

if (!canDelete) {
  return { error: 'Insufficient permissions' };
}
```

### `checkAnyPermission(ctx: Context, permissions: string[], options?: CheckOptions)`

Checks if user has any of the specified permissions.

```typescript
const canModify = await checkAnyPermission(ctx, [
  'product:update',
  'product:delete',
  'admin:full_access',
]);
```

### `checkAllPermissions(ctx: Context, permissions: string[], options?: CheckOptions)`

Checks if user has all specified permissions.

```typescript
await checkAllPermissions(ctx, [
  'product:read',
  'product:write',
]);
```

### `getMissingPermissions(ctx: Context, required: string[]): Promise<string[]>`

Returns list of permissions the user is missing.

```typescript
const missing = await getMissingPermissions(ctx, [
  'product:create',
  'product:delete',
]);

if (missing.length > 0) {
  console.log('Missing permissions:', missing);
}
```

### `requirePermission(permission: string, handler: Handler)`

Decorator that enforces permission before executing handler.

```typescript
const deleteProduct = requirePermission('product:delete',
  async (ctx, input) => {
    // Permission already checked
    return productRepo.delete(input.id);
  }
);
```

### `configurePermissions(config: PermissionConfig)`

Configures permission system integration.

```typescript
interface PermissionConfig {
  checkPermission: (ctx: any, permission: string) => Promise<boolean>;
  getPermissions: (ctx: any) => Promise<string[]>;
  isSuperUser?: (ctx: any) => Promise<boolean>;
  adminPermission?: string;  // Default: 'admin:full_access'
}
```

---

## Auth API

### `createAuthContext(session: Session): AuthContext`

Creates an authentication context from a session.

```typescript
interface AuthContext {
  userId: number;
  email: string;
  orgId?: number;
  permissions: string[];
  isAuthenticated: boolean;
}
```

#### Example

```typescript
import { createAuthContext } from '@jetdevs/framework/auth';

const authContext = createAuthContext(session);

if (!authContext.isAuthenticated) {
  throw new Error('Authentication required');
}
```

### `requireAuth(handler: Handler)`

Decorator that ensures user is authenticated.

```typescript
const protectedHandler = requireAuth(async (ctx) => {
  // User is guaranteed to be authenticated
  return { userId: ctx.userId };
});
```

### `getSessionUser(ctx: Context): User | null`

Extracts user from context session.

```typescript
const user = getSessionUser(ctx);

if (user) {
  console.log('Current user:', user.email);
}
```

---

## Configuration

### Complete Configuration Example

```typescript
// src/server/api/framework-config.ts
import {
  configureRouterFactory,
  configureDatabaseContext,
  configurePermissions
} from '@jetdevs/framework';

import { createTRPCRouter, orgProtectedProcedureWithPermission } from './trpc';
import { db } from '@/db';
import { createActor, hasPermission } from '@/server/domain/auth/actor';

export function setupFramework() {
  // 1. Configure Router Factory
  configureRouterFactory({
    createRouter: createTRPCRouter,
    createProtectedProcedure: (permission: string) => {
      return orgProtectedProcedureWithPermission(permission);
    },
    createPublicProcedure: () => publicProcedure,
  });

  // 2. Configure Database Context
  configureDatabaseContext({
    getDatabase: () => db,
    getOrgContext: (ctx) => ({
      orgId: ctx.session?.user?.currentOrgId || ctx.activeOrgId,
      workspaceId: ctx.activeWorkspaceId,
      userId: ctx.session?.user?.id,
    }),
  });

  // 3. Configure Permission System
  configurePermissions({
    checkPermission: async (ctx, permission) => {
      try {
        const actor = createActor(ctx);
        return hasPermission(actor, permission);
      } catch {
        return false;
      }
    },
    getPermissions: async (ctx) => {
      try {
        const actor = createActor(ctx);
        return actor.permissions;
      } catch {
        return [];
      }
    },
    isSuperUser: async (ctx) => {
      try {
        const actor = createActor(ctx);
        return actor.isSuperUser;
      } catch {
        return false;
      }
    },
  });
}

// Initialize on startup
setupFramework();
```

---

## Migration Guide - Phase 3

### Migrating to Phase 3 createRouterWithActor

#### Before (Traditional Pattern - 21 lines of boilerplate)

```typescript
import { createTRPCRouter, orgProtectedProcedureWithPermission } from '../trpc';
import { createActor, getDbContext, createServiceContext } from '@/server/domain/auth/actor';

export const productsRouter = createTRPCRouter({
  list: orgProtectedProcedureWithPermission('product:read')
    .meta({
      cacheControl: { scope: 'user', sMaxAge: 60 },
      cacheTags: ['products'],
    })
    .input(listSchema)
    .query(async ({ ctx, input }) => {
      // 🔴 These 6-7 lines repeated in EVERY procedure:
      const actor = createActor(ctx);
      const { dbFunction, effectiveOrgId } = getDbContext(ctx, actor);

      return dbFunction(async (db) => {
        const serviceContext = createServiceContext(db, actor, effectiveOrgId);
        const repo = new ProductsRepository(db);
        return repo.list({ ...input, orgId: effectiveOrgId });
      });
    }),

  create: orgProtectedProcedureWithPermission('product:create')
    .meta({ invalidateTags: ['products'] })
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      // 🔴 Same 6-7 lines repeated again:
      const actor = createActor(ctx);
      const { dbFunction, effectiveOrgId } = getDbContext(ctx, actor);

      return dbFunction(async (db) => {
        const serviceContext = createServiceContext(db, actor, effectiveOrgId);
        const repo = new ProductsRepository(db);
        return repo.create(input, effectiveOrgId, ctx.session?.user?.id);
      });
    }),
});
```

#### After (Phase 3 SDK - 8 lines per procedure, 62% reduction)

```typescript
import { createRouterWithActor } from '@jetdevs/framework/router';
import { ProductsRepository } from '@/server/repos/products.repository';

export const productsRouter = createRouterWithActor({
  list: {
    permission: 'product:read',
    input: listSchema,
    cache: { ttl: 60, tags: ['products'] },
    repository: ProductsRepository,
    handler: async ({ input, service, repo }) => {
      // ✅ All boilerplate eliminated!
      return repo.list({ ...input, orgId: service.orgId });
    },
  },

  create: {
    permission: 'product:create',
    input: createSchema,
    invalidates: ['products'],
    repository: ProductsRepository,
    entityType: 'product',
    handler: async ({ input, service, repo }) => {
      // ✅ service.userId available directly!
      return repo.create(input, service.orgId, service.userId);
    },
  },
});
```

### Migration Checklist - Phase 3

1. **Configure Adapter (One-Time)**
   ```typescript
   // In src/server/api/trpc.ts
   import { configureActorAdapter } from '@jetdevs/framework/router';

   configureActorAdapter({
     createActor,
     getDbContext,
     createServiceContext,
     getProcedure: (permission) =>
       permission
         ? orgProtectedProcedureWithPermission(permission)
         : orgProtectedProcedure,
     createTRPCRouter,
   });
   ```

2. **Update Router Imports**
   ```typescript
   // Before
   import { createTRPCRouter } from '../trpc';

   // After
   import { createRouterWithActor } from '@jetdevs/framework/router';
   ```

3. **Convert Procedures**
   - Replace boilerplate with declarative config
   - Specify `repository` for auto-instantiation
   - Add `entityType` for audit logging
   - Use `ensureResult` for auto-validation

4. **Test Thoroughly**
   - Verify permissions still work
   - Test RLS isolation
   - Check multi-tenant access
   - Verify telemetry and audit logs

---

## Best Practices

### 1. Always Configure on Startup

```typescript
// src/app/layout.tsx or initialization file
import { initializeFramework } from '@/server/api/framework-integration';

// Run once on app startup
if (!globalThis.frameworkInitialized) {
  initializeFramework();
  globalThis.frameworkInitialized = true;
}
```

### 2. Use Type-Safe Permissions

```typescript
// Define permission enums
enum ProductPermissions {
  READ = 'product:read',
  CREATE = 'product:create',
  UPDATE = 'product:update',
  DELETE = 'product:delete',
}

// Use in routers
export const productsRouter = createRouter({
  list: {
    permission: ProductPermissions.READ,
    // ...
  },
});
```

### 3. Handle Errors Gracefully

```typescript
import { TRPCError } from '@trpc/server';

handler: async (ctx, input) => {
  const product = await productRepo.findByUuid(input.uuid);

  if (!product) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Product not found',
    });
  }

  return product;
}
```

### 4. Use Repository Pattern for Complex Queries

```typescript
const productRepo = createRepository('products', {
  orgScoped: true,
}, ctx.db);

// Clean, simple operations
const products = await productRepo.findMany({
  search: 'laptop',
  limit: 20,
});
```

### 5. Test with Different Contexts

```typescript
// Test with different org contexts
await withRLSContext({ orgId: 1 }, async () => {
  const org1Products = await productRepo.findMany();
});

await withRLSContext({ orgId: 2 }, async () => {
  const org2Products = await productRepo.findMany();
});
```

---

## Troubleshooting

### "Router factory not configured"

**Solution**: Ensure `configureRouterFactory()` is called before creating routers.

```typescript
// Call this first
configureRouterFactory({ /* ... */ });

// Then create routers
export const router = createRouter({ /* ... */ });
```

### "Database not configured"

**Solution**: Call `configureDatabaseContext()` during initialization.

```typescript
configureDatabaseContext({
  getDatabase: () => db,
  getOrgContext: (ctx) => ({ /* ... */ }),
});
```

### "Permission denied" errors

**Check**:
1. User has the required permission in database
2. Permission configuration is correct
3. Session includes permissions array
4. Super user bypass is working

### RLS not filtering correctly

**Check**:
1. RLS policies exist in database
2. Context is being set correctly
3. `orgId` is present in context
4. Using `ctx.dbWithRLS` for queries

---

## Support

For issues, feature requests, or questions:
- GitHub: https://github.com/yobolabs/framework
- Documentation: https://docs.yobo.com/framework

---

## License

Private - © 2024 Yobo Platform