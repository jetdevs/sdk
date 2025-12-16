# @jetdevs/framework Usage Examples

This document shows how domains should use the framework utilities for cross-cutting concerns while maintaining their own business logic.

## Products Domain Example

### 1. Repository with Framework Patterns

```typescript
// src/server/repos/products.repository.ts

import type {
  DomainRepository,
  SearchableRepository,
  AuditableRepository
} from '@jetdevs/framework/patterns';
import { auditLog, calculateChanges } from '@jetdevs/framework/audit';
import { withCache, invalidatePattern } from '@jetdevs/framework/cache';
import { withTelemetry } from '@jetdevs/framework/telemetry';

export class ProductsRepository implements
  DomainRepository<Product>,
  SearchableRepository<Product>,
  AuditableRepository<Product> {

  constructor(private db: PostgresJsDatabase<typeof schema>) {}

  /**
   * Find product with caching
   */
  async findByUuid(uuid: string): Promise<Product | null> {
    return withCache(
      ['product', uuid],
      async () => {
        return this.db.query.products.findFirst({
          where: eq(products.uuid, uuid),
        });
      },
      { ttl: 300, tags: ['products'] }
    );
  }

  /**
   * Create product with audit logging and cache invalidation
   */
  async createWithAudit(data: CreateProductInput, context: AuditContext): Promise<Product> {
    return withTelemetry('product.create', async () => {
      const [product] = await this.db
        .insert(products)
        .values(data)
        .returning();

      // Audit log the creation
      await auditLog({
        action: 'create',
        entityType: 'product',
        entityId: product.uuid,
        metadata: { sku: product.sku, name: product.name }
      });

      // Invalidate related caches
      await invalidatePattern('products:*');

      return product;
    });
  }

  /**
   * Update with change tracking
   */
  async updateWithAudit(
    uuid: string,
    data: UpdateProductInput,
    context: AuditContext
  ): Promise<Product | null> {
    return withTelemetry('product.update', async () => {
      // Get current state for audit
      const current = await this.findByUuid(uuid);
      if (!current) return null;

      const [updated] = await this.db
        .update(products)
        .set(data)
        .where(eq(products.uuid, uuid))
        .returning();

      // Log changes
      await auditLog({
        action: 'update',
        entityType: 'product',
        entityId: uuid,
        changes: calculateChanges(current, updated),
      });

      // Invalidate caches
      await invalidateCache(['product', uuid]);
      await invalidatePattern('products:list:*');

      return updated;
    });
  }

  // ... other repository methods
}
```

### 2. Router with Framework Utilities

```typescript
// src/server/api/routers/products.router.ts

import { withTelemetry, trackMetric } from '@jetdevs/framework/telemetry';
import { requirePermission } from '@jetdevs/framework/permissions';
import { withRLSContext } from '@jetdevs/framework/rls';
import { publishEvent } from '@jetdevs/framework/events';

export const productsRouter = createTRPCRouter({
  create: orgProtectedProcedure
    .input(createProductSchema)
    .mutation(async ({ ctx, input }) => {
      // Use framework utilities for cross-cutting concerns
      return withTelemetry('products.create', async () => {
        // Permission check
        await requirePermission('product:create', ctx);

        // Execute with RLS context
        return withRLSContext(ctx.session, async () => {
          const repo = new ProductsRepository(ctx.db);

          const product = await repo.createWithAudit(input, {
            userId: ctx.session.user.id,
            action: 'create',
          });

          // Publish domain event
          await publishEvent('product.created', {
            productId: product.uuid,
            orgId: ctx.session.user.currentOrgId,
            createdBy: ctx.session.user.id,
            timestamp: new Date(),
          });

          // Track business metrics
          await trackMetric('products.created.count', 'counter', {
            tags: {
              category: product.categoryCode,
              status: product.status,
            }
          });

          return product;
        });
      });
    }),

  list: orgProtectedProcedure
    .input(listProductsSchema)
    .query(async ({ ctx, input }) => {
      // Use caching for read operations
      return withCache(
        ['products', 'list', input.page, input.filters],
        async () => {
          const repo = new ProductsRepository(ctx.db);
          return repo.list(input);
        },
        {
          ttl: 60,
          tags: ['products', 'list'],
          orgScoped: true
        }
      );
    }),
});
```

### 3. Server Actions with Framework

```typescript
// src/app/products/actions.ts

import { withServerAction, cachedAction } from '@jetdevs/framework/nextjs';
import { withCache, invalidatePattern } from '@jetdevs/framework/cache';

export const createProduct = withServerAction(
  'product.create',
  async (data: CreateProductInput) => {
    'use server';

    const session = await getSession();
    const repo = new ProductsRepository(db);

    const product = await repo.createWithAudit(data, {
      userId: session.user.id,
      action: 'create',
    });

    // Invalidate RSC cache
    await invalidatePattern('products:*');
    revalidatePath('/products');

    return product;
  },
  { audit: true, requireAuth: true }
);

export const getProducts = cachedAction(
  async (page: number, filters?: ProductFilters) => {
    'use server';

    const repo = new ProductsRepository(db);
    return repo.list({ page, filters });
  },
  {
    revalidate: 60,
    tags: ['products']
  }
);
```

### 4. API Routes with Framework

```typescript
// src/app/api/products/route.ts

import { withRouteHandler } from '@jetdevs/framework/nextjs';
import { withTelemetry } from '@jetdevs/framework/telemetry';

export const GET = withRouteHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');

  const products = await withTelemetry('api.products.list', async () => {
    const repo = new ProductsRepository(db);
    return repo.list({ page, pageSize: 20 });
  });

  return Response.json(products);
});
```

## Key Benefits

### 1. **Separation of Concerns**
- Business logic stays in repositories
- Cross-cutting concerns handled by framework
- Clean, testable code

### 2. **Consistency**
- All modules use same patterns for logging, caching, telemetry
- Standardized error handling
- Unified permission checking

### 3. **Observability**
- Automatic telemetry for all operations
- Audit trails without boilerplate
- Error tracking built-in

### 4. **Performance**
- Automatic caching with org isolation
- Cache invalidation patterns
- Parallel data fetching helpers

### 5. **Security**
- RLS context management
- Permission checking utilities
- Audit logging for compliance

## Migration Strategy

### Phase 1: Add Framework Utilities
Keep existing code, add framework utilities for new features:
```typescript
// Wrap existing methods with telemetry
async create(data: CreateProductInput) {
  return withTelemetry('product.create', async () => {
    // Existing logic
  });
}
```

### Phase 2: Add Audit Logging
```typescript
// Add audit logging to mutations
await auditLog({
  action: 'update',
  entityType: 'product',
  entityId: product.uuid,
});
```

### Phase 3: Implement Caching
```typescript
// Add caching to read operations
return withCache(['products', 'list'], async () => {
  // Existing query logic
});
```

### Phase 4: Publish Events
```typescript
// Publish domain events for other services
await publishEvent('product.created', product);
```

## What NOT to Do

### ❌ Don't Force Generic CRUD
```typescript
// BAD - Forces all domains into same pattern
const repo = createRepository('products', { orgScoped: true }, db);
await repo.create(data); // No business logic possible
```

### ✅ Do Keep Domain Logic
```typescript
// GOOD - Domain controls business logic
class ProductsRepository {
  async create(data) {
    // Custom validation
    // Business rules
    // Complex logic
  }
}
```

### ❌ Don't Mix Concerns
```typescript
// BAD - Mixing business logic with infrastructure
async create(data) {
  // Telemetry mixed with business logic
  const startTime = Date.now();
  try {
    // Business logic here
  } catch (error) {
    // Error tracking mixed in
  }
}
```

### ✅ Do Use Framework Utilities
```typescript
// GOOD - Clean separation
async create(data) {
  return withTelemetry('product.create', async () => {
    // Pure business logic
  });
}
```

## Summary

The @jetdevs/framework provides the **plumbing** (cross-cutting concerns) while your domains provide the **business logic**. This separation gives you:

1. **Flexibility** - Domains can have complex, custom logic
2. **Consistency** - All domains use same infrastructure patterns
3. **Maintainability** - Clear separation of concerns
4. **Observability** - Built-in monitoring and debugging
5. **Security** - Standardized auth, permissions, and audit

The framework is your **horizontal layer** that every domain uses, not a **vertical constraint** that limits what domains can do.