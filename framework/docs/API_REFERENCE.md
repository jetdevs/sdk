# @yobo/framework API Reference

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Router API](#router-api)
3. [Database API](#database-api)
4. [Permissions API](#permissions-api)
5. [Auth API](#auth-api)
6. [Configuration](#configuration)
7. [Migration Guide](#migration-guide)

---

## Installation & Setup

### Install the Package

```bash
pnpm add @yobo/framework
```

### Initial Configuration

The framework must be configured once during application startup:

```typescript
// src/server/api/framework-integration.ts
import {
  configureRouterFactory,
  configureDatabaseContext,
  configurePermissions
} from '@yobo/framework';

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

## Router API

### `createRouter(routes: RouterConfig): TRPCRouter`

Creates a tRPC router with automatic permission checking and RLS context management.

#### Parameters

- `routes`: Object defining route handlers with permissions

#### Route Definition

```typescript
interface RouteDefinition {
  permission?: string;           // Required permission
  input?: ZodSchema;             // Zod validation schema
  type?: 'query' | 'mutation';  // Defaults based on input presence
  description?: string;          // Route description
  handler: (ctx, input?) => Promise<any>;
}
```

#### Example

```typescript
import { createRouter } from '@yobo/framework/router';
import { z } from 'zod';

export const productsRouter = createRouter({
  // Query with permission check
  list: {
    permission: 'product:read',
    handler: async (ctx) => {
      // Permission already checked, RLS context set
      return ctx.db.query.products.findMany();
    },
  },

  // Mutation with input validation
  create: {
    permission: 'product:create',
    input: z.object({
      name: z.string().min(1),
      price: z.number().positive(),
    }),
    handler: async (ctx, input) => {
      // Input is validated and typed
      return ctx.db.insert(products).values(input).returning();
    },
  },

  // Public route (no permission required)
  getPublicInfo: {
    handler: async (ctx) => {
      return { version: '1.0.0' };
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
import { checkPermission } from '@yobo/framework/permissions';

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
import { createAuthContext } from '@yobo/framework/auth';

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
} from '@yobo/framework';

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

## Migration Guide

### Migrating from Traditional Router

#### Before (Traditional Pattern)

```typescript
import { createTRPCRouter, orgProtectedProcedureWithPermission } from '../trpc';
import { createActor, getDbContext } from '@/server/domain/auth/actor';

export const productsRouter = createTRPCRouter({
  list: orgProtectedProcedureWithPermission('product:read')
    .input(listSchema)
    .query(async ({ ctx, input }) => {
      const actor = createActor(ctx);
      const { dbFunction, effectiveOrgId } = getDbContext(ctx, actor);

      return dbFunction(async (db) => {
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        const products = await db.query.products.findMany({
          where: eq(products.orgId, effectiveOrgId),
          limit: input.limit,
          offset: input.offset,
        });

        const [{ total }] = await db
          .select({ total: count() })
          .from(products)
          .where(eq(products.orgId, effectiveOrgId));

        return { items: products, total };
      });
    }),

  create: orgProtectedProcedureWithPermission('product:create')
    .input(createSchema)
    .mutation(async ({ ctx, input }) => {
      const actor = createActor(ctx);
      const { dbFunction, effectiveOrgId } = getDbContext(ctx, actor);

      return dbFunction(async (db) => {
        const serviceCtx = createServiceContext(db, actor, effectiveOrgId);

        const [product] = await db
          .insert(products)
          .values({
            ...input,
            orgId: effectiveOrgId,
          })
          .returning();

        return product;
      });
    }),
});
```

#### After (Framework Pattern)

```typescript
import { createRouter } from '@yobo/framework/router';

export const productsRouter = createRouter({
  list: {
    permission: 'product:read',
    input: listSchema,
    handler: async (ctx, input) => {
      // All boilerplate is handled by framework
      const products = await ctx.db.query.products.findMany({
        limit: input.limit,
        offset: input.offset,
      });

      const [{ total }] = await ctx.db
        .select({ total: count() })
        .from(products);

      return { items: products, total };
    },
  },

  create: {
    permission: 'product:create',
    input: createSchema,
    handler: async (ctx, input) => {
      const [product] = await ctx.db
        .insert(products)
        .values({
          ...input,
          orgId: ctx.session.user.currentOrgId,
        })
        .returning();

      return product;
    },
  },
});
```

### Migration Checklist

1. **Install Framework**
   ```bash
   pnpm add @yobo/framework
   ```

2. **Create Configuration File**
   - Set up `framework-integration.ts`
   - Initialize on app startup

3. **Migrate Routers One by One**
   - Start with simple CRUD routers
   - Test each migration thoroughly
   - Keep original router as backup

4. **Update Imports**
   ```typescript
   // Before
   import { createTRPCRouter } from '../trpc';

   // After
   import { createRouter } from '@yobo/framework/router';
   ```

5. **Remove Boilerplate**
   - Remove actor creation
   - Remove dbContext management
   - Remove manual RLS setup
   - Simplify to business logic

6. **Test Security**
   - Verify permissions still work
   - Test RLS isolation
   - Check multi-tenant access

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
- GitHub: https://github.com/yobo/framework
- Documentation: https://docs.yobo.com/framework

---

## License

Private - © 2024 Yobo Platform