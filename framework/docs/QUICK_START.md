# Framework Quick Start Guide

## One-Time Setup

### 1. Configure Router Factory

In your tRPC setup file (e.g., `src/server/api/trpc.ts`):

```typescript
import { configureRouterFactory } from '@yobolabs/framework/router';
import { createTRPCRouter, orgProtectedProcedureWithPermission } from './trpc';

// Configure once during app initialization
configureRouterFactory({
  createRouter: createTRPCRouter,
  createProtectedProcedure: orgProtectedProcedureWithPermission,
});
```

### 2. Configure Auth

In your auth setup file (e.g., `src/server/auth.ts`):

```typescript
import { configureAuth } from '@yobolabs/framework/auth';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth-options';
import { db } from '@/server/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

configureAuth({
  getSession: async () => {
    const session = await getServerSession(authOptions);
    return session as Session | null;
  },
  switchOrg: async (userId, newOrgId) => {
    await db.update(users)
      .set({ currentOrgId: newOrgId })
      .where(eq(users.id, userId));
  },
});
```

---

## Daily Usage

### Creating Routers

```typescript
import { createRouter, createRouteGroup } from '@yobolabs/framework/router';
import { createRepository } from '@yobolabs/framework/db';
import { z } from 'zod';

// Simple router
export const campaignRouter = createRouter({
  // List - query without input
  list: {
    permission: 'campaign:read',
    type: 'query',
    handler: async (ctx) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return await repo.findMany();
    },
  },

  // Create - mutation with input
  create: {
    permission: 'campaign:create',
    input: z.object({
      name: z.string(),
      status: z.enum(['draft', 'active']),
    }),
    handler: async (ctx, input) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return await repo.create(input);
    },
  },

  // Update
  update: {
    permission: 'campaign:update',
    input: z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.enum(['draft', 'active']).optional(),
    }),
    handler: async (ctx, input) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      const { id, ...data } = input;
      return await repo.update(id, data);
    },
  },

  // Delete
  delete: {
    permission: 'campaign:delete',
    input: z.object({ id: z.number() }),
    handler: async (ctx, input) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      await repo.delete(input.id);
    },
  },
});

// Route groups with shared permission
const adminRoutes = createRouteGroup('admin:access', {
  listUsers: {
    handler: async (ctx) => {
      const repo = createRepository('users', { orgScoped: true }, ctx.db);
      return await repo.findMany();
    },
  },
  deleteUser: {
    input: z.object({ id: z.number() }),
    handler: async (ctx, input) => {
      const repo = createRepository('users', { orgScoped: true }, ctx.db);
      await repo.delete(input.id);
    },
  },
});

export const adminRouter = createRouter(adminRoutes);
```

### Using Repository

```typescript
import { createRepository } from '@yobolabs/framework/db';

// In your tRPC handler (ctx has db and RLS context is set automatically)
const handler = async (ctx) => {
  // Create repository for org-scoped table
  const campaignRepo = createRepository('campaigns', { orgScoped: true }, ctx.db);

  // All operations are automatically scoped to current org
  const campaigns = await campaignRepo.findMany();
  const campaign = await campaignRepo.findOne(1);
  const created = await campaignRepo.create({ name: 'New Campaign' });
  const updated = await campaignRepo.update(1, { name: 'Updated' });
  await campaignRepo.delete(1);

  // With workspace support
  const workspaceRepo = createRepository(
    'workspace_items',
    { orgScoped: true, workspaceScoped: true },
    ctx.db
  );

  // Automatically injects both org_id and workspace_id
  const item = await workspaceRepo.create({ name: 'Item' });
};
```

### Using Auth Helpers

```typescript
import {
  getSession,
  isAuthenticated,
  getCurrentUser,
  getCurrentOrgId,
  switchOrg,
  requireAuth,
} from '@yobolabs/framework/auth';

// In API routes or server components
export async function GET() {
  // Get session
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Or check authentication
  if (!(await isAuthenticated())) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Get current user
  const user = await getCurrentUser();
  console.log('User:', user.email);

  // Get current org ID
  const orgId = await getCurrentOrgId();

  return new Response(JSON.stringify({ user, orgId }));
}

// Switch organization
export async function POST(request: Request) {
  const { orgId } = await request.json();
  const user = await getCurrentUser();

  await switchOrg(user.id, orgId);

  return new Response('OK');
}

// Require auth wrapper
const handler = requireAuth(async (session, input) => {
  // Session is guaranteed to exist
  return { userId: session.user.id };
});
```

---

## Common Patterns

### Pattern: Custom Filters with Repository

```typescript
const handler = async (ctx, input) => {
  const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);

  // Filters are automatically combined with org_id filter
  const activeCampaigns = await repo.findMany({ status: 'active' });

  // Count with filters
  const count = await repo.count({ status: 'active' });

  return { campaigns: activeCampaigns, total: count };
};
```

### Pattern: Public Routes

```typescript
// Routes without permissions are public (if createPublicProcedure is available)
export const publicRouter = createRouter({
  healthCheck: {
    handler: async (ctx) => ({ status: 'ok' }),
  },
});
```

### Pattern: Complex Queries

```typescript
const handler = async (ctx) => {
  // For complex queries, use dbWithRLS from context
  return await ctx.dbWithRLS(async (db) => {
    return await db.query.campaigns.findMany({
      where: (campaigns, { eq, and }) =>
        and(eq(campaigns.orgId, ctx.activeOrgId), eq(campaigns.status, 'active')),
      with: {
        owner: true,
        metrics: true,
      },
    });
  });
};
```

### Pattern: Manual RLS Context (Advanced)

```typescript
import { withRLSContext } from '@yobolabs/framework/db';

// Rarely needed - routers set this up automatically
const result = await withRLSContext(
  { orgId: 1, workspaceId: 10, userId: 100 },
  async () => {
    const repo = createRepository('campaigns', { orgScoped: true }, db);
    return await repo.findMany();
  }
);
```

---

## Type Safety

### Define Your Types

```typescript
// Define your entity types
interface Campaign {
  id: number;
  name: string;
  status: 'draft' | 'active' | 'paused';
  org_id: number;
  created_at: Date;
}

// Use with repository
const repo = createRepository<Campaign>('campaigns', { orgScoped: true }, ctx.db);

// Now all operations are typed
const campaign: Campaign = await repo.findOne(1); // Returns Campaign | undefined
const campaigns: Campaign[] = await repo.findMany();
const created: Campaign = await repo.create({ name: 'New', status: 'draft' });
```

### Typed Route Handlers

```typescript
import type { RouteHandler } from '@yobolabs/framework/router';

// Define handler type
type ListCampaignsHandler = RouteHandler<
  { status?: 'draft' | 'active' }, // Input type
  Campaign[] // Output type
>;

const handler: ListCampaignsHandler = async (ctx, input) => {
  const repo = createRepository<Campaign>('campaigns', { orgScoped: true }, ctx.db);
  return await repo.findMany(input);
};
```

---

## Error Handling

```typescript
// Framework errors are descriptive
try {
  const repo = createRepository('campaigns', { orgScoped: true }, db);
  await repo.findMany();
} catch (error) {
  // Error: "No RLS context available. Ensure your tRPC procedure is using orgProtectedProcedure..."
}

// Repository errors
try {
  await repo.create({ name: 'Test' });
} catch (error) {
  // Error: "Failed to create record in campaigns"
}

// Update non-existent record
try {
  await repo.update(999, { name: 'Test' });
} catch (error) {
  // Error: "Failed to update record 999 in campaigns. Record may not exist or you may not have access to it."
}
```

---

## Testing

```typescript
import { withRLSContext } from '@yobolabs/framework/db';
import { createRepository } from '@yobolabs/framework/db';

describe('Campaign Repository', () => {
  it('should create campaign with org_id', async () => {
    await withRLSContext({ orgId: 1, userId: 100 }, async () => {
      const repo = createRepository('campaigns', { orgScoped: true }, db);
      const campaign = await repo.create({ name: 'Test' });

      expect(campaign.org_id).toBe(1);
    });
  });
});
```

---

## Security Notes

### Automatic Protection

1. **Org Isolation**: All org-scoped repositories automatically filter by current org
2. **Permission Checks**: Routes with `permission` field require that permission
3. **RLS Context**: Set up automatically by router factory from tRPC context
4. **Input Validation**: Zod schemas validate all inputs before reaching handlers

### What You Can't Do (By Design)

```typescript
// ❌ This won't work - org_id is forced to current org
await repo.findMany({ org_id: 999 }); // Still filtered to current org

// ❌ This won't work - org_id cannot be changed
await repo.create({ name: 'Test', org_id: 999 }); // org_id forced to current org

// ❌ This won't work - org_id is stripped on update
await repo.update(1, { name: 'Test', org_id: 999 }); // org_id ignored
```

---

## Performance Tips

1. **Repository creation is cheap** - create repositories in handlers as needed
2. **RLS context lookup is O(1)** - AsyncLocalStorage is highly optimized
3. **Use bulk operations** - findMany is more efficient than multiple findOne calls
4. **Cache session data** - if calling getCurrentUser multiple times, cache the result

---

## Migration from Old Patterns

### Before (Manual RLS)

```typescript
export const listCampaigns = orgProtectedProcedure
  .input(listSchema)
  .query(async ({ ctx, input }) => {
    return await ctx.dbWithRLS(async (db) => {
      return await db.query.campaigns.findMany({
        where: (campaigns, { eq }) => eq(campaigns.orgId, ctx.activeOrgId),
      });
    });
  });
```

### After (Framework)

```typescript
export const campaignRouter = createRouter({
  list: {
    permission: 'campaign:read',
    input: listSchema,
    handler: async (ctx, input) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return await repo.findMany();
    },
  },
});
```

**Benefits:**
- 70% less code
- Automatic org filtering
- Type-safe CRUD operations
- No manual RLS context management
- Cannot accidentally forget org filter

---

## Getting Help

- **Read tests**: Check `src/**/__tests__/*.test.ts` for usage examples
- **Check types**: TypeScript will guide you with autocomplete
- **Error messages**: Framework provides helpful, actionable error messages

---

## Summary

**Three simple steps:**

1. Configure once during app startup
   ```typescript
   configureRouterFactory({ ... });
   configureAuth({ ... });
   ```

2. Create routers with clean syntax
   ```typescript
   export const router = createRouter({ ... });
   ```

3. Use repositories in handlers
   ```typescript
   const repo = createRepository('table', { orgScoped: true }, ctx.db);
   ```

**Everything else is automatic:**
- ✅ RLS context management
- ✅ Org-level isolation
- ✅ Permission checks
- ✅ Type safety
- ✅ Security enforcement
