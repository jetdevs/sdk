# @yobolabs/framework Usage Guide

## Overview

The `@yobolabs/framework` package provides core infrastructure abstractions that hide security-critical implementation details while enabling rapid feature development.

## Installation

The package is already included in the monorepo. In `apps/merchant-portal/package.json`:

```json
{
  "dependencies": {
    "@yobolabs/framework": "workspace:*"
  }
}
```

## Core Concepts

### 1. Database Repository Factory

Creates type-safe repositories with automatic RLS enforcement.

**What's Hidden:**
- RLS context setup (`set_org_context`)
- `ctx.dbWithRLS` vs `withPrivilegedDb` logic
- Database client configuration
- Org context validation

**What Developers Get:**
```typescript
import { createRepository } from '@yobolabs/framework/db';
import type { Campaign } from '@/db/schema';

// Create org-scoped repository
const campaignRepo = createRepository<Campaign>('campaigns', {
  orgScoped: true,
  workspaceScoped: false
}, ctx.db);

// Use repository - RLS is automatic
const campaigns = await campaignRepo.findMany({ status: 'active' });

// Create with automatic org_id injection
const campaign = await campaignRepo.create({
  name: 'Summer Sale',
  status: 'draft'
  // org_id is automatically injected
});

// Update - scoped to current org
await campaignRepo.update(campaign.id, { status: 'active' });

// Delete - scoped to current org
await campaignRepo.delete(campaign.id);

// Count - scoped to current org
const count = await campaignRepo.count({ status: 'active' });
```

### 2. Permission System

Declarative permission checking that cannot be bypassed.

**What's Hidden:**
- Permission validation implementation
- JWT structure and validation
- Database permission lookups
- `withPrivilegedDb` access

**What Developers Get:**
```typescript
import {
  requirePermission,
  checkPermission,
  requireAnyPermission,
  requireAllPermissions
} from '@yobolabs/framework/permissions';

// Decorator pattern - automatic permission check
export const deleteCampaign = requirePermission(
  'campaign:delete',
  async (ctx, input) => {
    // Permission already checked - safe to proceed
    return campaignRepo.delete(input.id);
  }
);

// Imperative check
if (await checkPermission(ctx, 'campaign:manage')) {
  // User has permission
}

// Require any of multiple permissions
const viewCampaign = requireAnyPermission(
  ['campaign:read', 'campaign:manage'],
  async (ctx, input) => {
    return campaignRepo.findOne(input.id);
  }
);

// Require all permissions
const advancedOperation = requireAllPermissions(
  ['workflow:update', 'workflow:execute'],
  async (ctx, input) => {
    return performAdvancedOperation(input);
  }
);
```

### 3. Router Factory

Standardized router creation with built-in security.

**What's Hidden:**
- tRPC context creation
- Procedure type selection
- RLS context setup
- Error handling boilerplate

**What Developers Get:**
```typescript
import { createRouter, createRouteGroup } from '@yobolabs/framework/router';
import { z } from 'zod';

export const campaignRouter = createRouter({
  // List campaigns
  list: {
    permission: 'campaign:read',
    description: 'List all campaigns for current org',
    handler: async (ctx) => {
      // Permission checked, RLS context set
      return campaignRepo.findMany();
    },
  },

  // Get single campaign
  get: {
    permission: 'campaign:read',
    input: z.object({
      id: z.number(),
    }),
    handler: async (ctx, input) => {
      return campaignRepo.findOne(input.id);
    },
  },

  // Create campaign
  create: {
    permission: 'campaign:create',
    input: z.object({
      name: z.string().min(1).max(255),
      status: z.enum(['draft', 'active', 'paused']),
      description: z.string().optional(),
    }),
    handler: async (ctx, input) => {
      // Input is validated and typed
      return campaignRepo.create(input);
    },
  },

  // Update campaign
  update: {
    permission: 'campaign:update',
    input: z.object({
      id: z.number(),
      name: z.string().optional(),
      status: z.enum(['draft', 'active', 'paused']).optional(),
    }),
    handler: async (ctx, input) => {
      const { id, ...data } = input;
      return campaignRepo.update(id, data);
    },
  },

  // Delete campaign
  delete: {
    permission: 'campaign:delete',
    input: z.object({
      id: z.number(),
    }),
    handler: async (ctx, input) => {
      await campaignRepo.delete(input.id);
      return { success: true };
    },
  },
});

// Create a route group with shared permission
const adminRoutes = createRouteGroup('admin:access', {
  listUsers: {
    handler: async (ctx) => userRepo.findMany(),
  },
  deleteUser: {
    input: z.object({ id: z.number() }),
    handler: async (ctx, input) => userRepo.delete(input.id),
  },
});
```

### 4. Authentication Helpers

Clean wrappers around NextAuth session management.

**What's Hidden:**
- JWT structure and signing
- Session validation logic
- NextAuth configuration
- Token refresh mechanism

**What Developers Get:**
```typescript
import { getSession, switchOrg, requireAuth } from '@yobolabs/framework/auth';

// Get current session
const session = await getSession();
if (!session) {
  throw new Error('Not authenticated');
}

console.log('User:', session.user.email);
console.log('Org:', session.user.currentOrgId);

// Switch organization
await switchOrg(session, 5);

// Require authentication decorator
const handler = requireAuth(async (session, request) => {
  // Session is guaranteed to exist
  return {
    userId: session.user.id,
    orgId: session.user.currentOrgId,
  };
});
```

## Complete Example: Campaign Router

```typescript
// apps/merchant-portal/src/campaigns/router.ts
import { createRouter } from '@yobolabs/framework/router';
import { createRepository } from '@yobolabs/framework/db';
import { z } from 'zod';
import type { Campaign } from '@/db/schema';

// Schema validation
const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(['draft', 'active', 'paused']),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

// Router definition
export const campaignRouter = createRouter({
  list: {
    permission: 'campaign:read',
    description: 'List all campaigns',
    handler: async (ctx) => {
      const repo = createRepository<Campaign>('campaigns', {
        orgScoped: true
      }, ctx.db);

      return repo.findMany();
    },
  },

  create: {
    permission: 'campaign:create',
    description: 'Create a new campaign',
    input: createCampaignSchema,
    handler: async (ctx, input) => {
      const repo = createRepository<Campaign>('campaigns', {
        orgScoped: true
      }, ctx.db);

      // org_id is automatically injected
      const campaign = await repo.create({
        ...input,
        createdBy: ctx.session.user.id,
      });

      return campaign;
    },
  },

  update: {
    permission: 'campaign:update',
    description: 'Update an existing campaign',
    input: z.object({
      id: z.number(),
      data: createCampaignSchema.partial(),
    }),
    handler: async (ctx, input) => {
      const repo = createRepository<Campaign>('campaigns', {
        orgScoped: true
      }, ctx.db);

      return repo.update(input.id, input.data);
    },
  },

  delete: {
    permission: 'campaign:delete',
    description: 'Delete a campaign',
    input: z.object({
      id: z.number(),
    }),
    handler: async (ctx, input) => {
      const repo = createRepository<Campaign>('campaigns', {
        orgScoped: true
      }, ctx.db);

      await repo.delete(input.id);
      return { success: true };
    },
  },
});
```

## What Developers Can Do

✅ **Allowed:**
- Build new campaign features
- Add CRUD operations
- Create custom business logic
- Build UI components
- Query data (within their org scope)
- Use type-safe APIs
- Modify domain logic

## What Developers Cannot Do

❌ **Prevented:**
- See RLS implementation details
- Access AWS credentials
- Bypass permission checks
- Modify org isolation logic
- See WhatsApp API keys
- Access system secrets
- Modify framework internals
- Use privileged database client
- Access other orgs' data

## Security Benefits

### Layer 1: Database Access
- RLS enforcement is automatic and unbypassable
- Org context is always validated
- Queries are automatically scoped
- `org_id` is automatically injected on create

### Layer 2: Permissions
- Permission checks cannot be skipped
- JWT structure is hidden
- Permission validation is centralized
- Admin bypass is built-in but hidden

### Layer 3: Authentication
- Session management is abstracted
- Token refresh is automatic
- Org switching is validated
- Session validation is hidden

## TypeScript Support

The framework provides full TypeScript type safety:

```typescript
import type { Repository, Permission, Session } from '@yobolabs/framework';

// Repository is fully typed
const repo: Repository<Campaign> = createRepository('campaigns', {
  orgScoped: true
}, ctx.db);

// Autocomplete works
const campaigns = await repo.findMany(); // Campaign[]

// Permission strings are type-checked
const perm: Permission = 'campaign:read'; // ✅ OK
```

## Migration Guide

### Before (Direct DB Access)
```typescript
export const campaignRouter = createTRPCRouter({
  list: orgProtectedProcedureWithPermission("campaign:read")
    .query(async ({ ctx }) => {
      return ctx.dbWithRLS(async (db) => {
        return db.query.campaigns.findMany({
          where: eq(campaigns.orgId, ctx.activeOrgId),
        });
      });
    }),

  create: orgProtectedProcedureWithPermission("campaign:create")
    .input(createCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.dbWithRLS(async (db) => {
        const [campaign] = await db.insert(campaigns).values({
          ...input,
          orgId: ctx.activeOrgId, // Manual injection
        }).returning();
        return campaign;
      });
    }),
});
```

### After (Framework SDK)
```typescript
import { createRouter } from '@yobolabs/framework/router';
import { createRepository } from '@yobolabs/framework/db';

export const campaignRouter = createRouter({
  list: {
    permission: 'campaign:read',
    handler: async (ctx) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return repo.findMany(); // RLS automatic, org_id filtered
    },
  },

  create: {
    permission: 'campaign:create',
    input: createCampaignSchema,
    handler: async (ctx, input) => {
      const repo = createRepository('campaigns', { orgScoped: true }, ctx.db);
      return repo.create(input); // org_id automatically injected
    },
  },
});
```

**Benefits:**
- 70% less boilerplate code
- No manual `org_id` handling
- Consistent patterns across all routers
- Cannot accidentally bypass security
- Better type inference

## Next Steps

1. ✅ Phase 1 Complete: Framework SDK with database, permissions, auth, and router abstractions
2. 🔜 Phase 2: Cloud Services SDK (`@yobo/cloud`) for S3, SQS, SES operations
3. 🔜 Phase 3: Platform Services SDK (`@yobo/platform`) for user, org, WhatsApp, config operations
4. 🔜 Phase 4: Migration of existing routers to use the framework

## Support

For questions or issues with the framework:
1. Check this usage guide first
2. Review example implementations
3. Contact the platform team
