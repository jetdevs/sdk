# @yobo/framework

Core infrastructure abstractions for the Yobo Platform. This SDK protects critical security implementation details while providing clean, type-safe APIs for rapid feature development.

## Overview

The `@yobo/framework` package is the first of three SDKs in Yobo's hybrid architecture:

1. **@yobo/framework** (This Package) - Core infrastructure abstractions (local)
2. **@yobo/cloud** (Coming Soon) - AWS service wrappers (remote services)
3. **@yobo/platform** (Coming Soon) - Platform service clients (remote services)

## Features

### Database Repository Factory
- Automatic RLS (Row-Level Security) enforcement
- Type-safe CRUD operations
- Automatic `org_id` injection
- Zero-configuration multi-tenancy

### Permission System
- Declarative permission checks
- Unbypassable security
- Admin bypass built-in
- Full TypeScript support

### Router Factory
- Standardized tRPC router creation
- Built-in permission checks
- Automatic input validation
- Consistent error handling

### Authentication Helpers
- Clean session management
- Organization switching
- JWT abstraction
- Type-safe auth context

## Installation

```bash
pnpm add @yobo/framework
```

## Quick Start

```typescript
import { createRepository, createRouter } from '@yobo/framework';
import { z } from 'zod';

// Create a repository with automatic RLS
const campaignRepo = createRepository('campaigns', {
  orgScoped: true,
}, ctx.db);

// Use the repository - RLS is automatic
const campaigns = await campaignRepo.findMany({ status: 'active' });

// Create a router with built-in security
export const campaignRouter = createRouter({
  list: {
    permission: 'campaign:read',
    handler: async (ctx) => campaignRepo.findMany(),
  },

  create: {
    permission: 'campaign:create',
    input: z.object({
      name: z.string(),
      status: z.enum(['draft', 'active']),
    }),
    handler: async (ctx, input) => {
      // Input validated, permission checked, org_id auto-injected
      return campaignRepo.create(input);
    },
  },
});
```

## What's Protected

Developers using this SDK **cannot** access:

- ❌ RLS implementation details (`set_org_context`, `withPrivilegedDb`)
- ❌ Permission validation internals
- ❌ JWT structure and signing logic
- ❌ Database client configuration
- ❌ NextAuth internals
- ❌ Org isolation implementation

## What Developers Get

Developers using this SDK **can** access:

- ✅ Type-safe CRUD operations
- ✅ Clean permission checking
- ✅ Simple router creation
- ✅ Session management
- ✅ Full TypeScript autocomplete
- ✅ Focus on business logic, not infrastructure

## API Reference

### Database Module

```typescript
import { createRepository } from '@yobo/framework/db';

const repo = createRepository<T>(tableName, options, db);
await repo.findMany(filters);
await repo.findOne(id);
await repo.create(data);
await repo.update(id, data);
await repo.delete(id);
await repo.count(filters);
```

### Permissions Module

```typescript
import {
  requirePermission,
  checkPermission,
  requireAnyPermission,
  requireAllPermissions,
} from '@yobo/framework/permissions';

// Decorator pattern
const handler = requirePermission('campaign:delete', async (ctx, input) => {
  return campaignRepo.delete(input.id);
});

// Imperative check
if (await checkPermission(ctx, 'campaign:manage')) {
  // User has permission
}
```

### Router Module

```typescript
import { createRouter, createRouteGroup } from '@yobo/framework/router';

const router = createRouter({
  routeName: {
    permission: 'resource:action',
    input: zodSchema,
    description: 'What this route does',
    handler: async (ctx, input) => { ... },
  },
});
```

### Auth Module

```typescript
import { getSession, switchOrg, requireAuth } from '@yobo/framework/auth';

const session = await getSession();
await switchOrg(session, newOrgId);

const handler = requireAuth(async (session, request) => {
  // Session guaranteed to exist
  return { userId: session.user.id };
});
```

## Documentation

- [Usage Guide](./USAGE.md) - Complete usage examples
- [Architecture Background](../../apps/merchant-portal/ai/requirements/p18-sdk/background.md)
- [Implementation Task](../../apps/merchant-portal/ai/requirements/p18-sdk/task.md)
- [Security Analysis](../../apps/merchant-portal/ai/requirements/p18-sdk/approach.md)

## Benefits

### For Security
- ✅ Core infrastructure code hidden from developers
- ✅ RLS and permission logic cannot be bypassed
- ✅ Multi-tenant data isolation enforced automatically
- ✅ Audit trail maintained

### For Developer Experience
- ✅ Clean, intuitive APIs
- ✅ Full TypeScript type safety
- ✅ 70% less boilerplate code
- ✅ Focus on business logic, not infrastructure
- ✅ Consistent patterns across all routers

### For Operations
- ✅ Centralized security enforcement
- ✅ Version control for infrastructure changes
- ✅ Easier to audit and secure
- ✅ No credentials in application code

## Architecture

This package implements **local abstractions** - all code runs within the merchant-portal application process. There are no external API calls.

```
Developer Code (campaigns, segments, orders, etc.)
     ↓ Uses SDK
@yobo/framework (Local Abstractions)
     ↓ Internal implementation
RLS Context + Permission Validation + Database Access
     ↓ PostgreSQL
Database with RLS Policies
```

## Development

```bash
# Build the package
pnpm build

# Watch mode
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

## Version

Current version: 1.0.0 (Phase 1 Complete)

## Phase 1 Status: ✅ Complete

Phase 1 deliverables:
- ✅ Database repository factory with automatic RLS
- ✅ Permission system with declarative checks
- ✅ Auth helpers for session management
- ✅ Router factory with built-in security
- ✅ Build configuration (tsup)
- ✅ TypeScript type definitions
- ✅ Usage documentation

## Next Phases

- **Phase 2**: Cloud Services SDK (`@yobo/cloud`)
  - S3 file operations
  - SQS queue operations
  - SES email operations

- **Phase 3**: Platform Services SDK (`@yobo/platform`)
  - User management
  - Organization operations
  - WhatsApp integration
  - System configuration

- **Phase 4**: Integration & Migration
  - Campaign router migration example
  - Developer documentation
  - CI/CD setup
  - Deployment documentation

## License

PRIVATE - Yobo Platform Internal Use Only

## Support

For questions or issues:
1. Check the [Usage Guide](./USAGE.md)
2. Review example implementations
3. Contact the platform team
