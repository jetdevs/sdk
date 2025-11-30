# Plan: Reduce saas-core-v3 to Core Multi-Tenant SaaS Platform

## Overview
Transform saas-core-v3 (copied from saas-merchant) into a generic core SaaS platform by removing all domain-specific modules while preserving the robust authentication, RBAC, organization management, and infrastructure.

## Execution Phases

---

## Phase 1: Delete Domain-Specific App Routes

### 1.1 Delete Campaign-Related Routes
```bash
rm -rf src/app/(no-sidebar)/campaigns/
rm -rf src/app/(org)/campaigns/
rm -rf src/app/backoffice/campaigns/
rm -rf src/app/backoffice/campaign-events/
rm -rf src/app/api/v1/campaigns/
```

### 1.2 Delete Customer-Related Routes
```bash
rm -rf src/app/(org)/customers/
rm -rf src/app/backoffice/customers/
rm -rf src/app/(backend-delete)/admin/customers/
rm -rf src/app/api/v1/customers/
```

### 1.3 Delete Product/Catalog Routes
```bash
rm -rf src/app/(org)/products/
rm -rf src/app/backoffice/products/
```

### 1.4 Delete Workflow Routes
```bash
rm -rf src/app/(dashboard)/workflows/
rm -rf src/app/(org)/workflows/
rm -rf src/app/backoffice/workflows/
rm -rf src/app/api/workflow/
```

### 1.5 Delete Credits/Billing Routes
```bash
rm -rf src/app/(sidebar)/credits/
rm -rf src/app/(sidebar)/admin/credits/
rm -rf src/app/backoffice/credits/
```

### 1.6 Delete Other Domain Routes
```bash
rm -rf src/app/(org)/outlets/
rm -rf src/app/backoffice/outlets/
rm -rf src/app/(org)/transactions/
rm -rf src/app/backoffice/transactions/
rm -rf src/app/(org)/offers/
rm -rf src/app/(org)/strategies/
rm -rf src/app/backoffice/offers/
rm -rf src/app/backoffice/strategies/
rm -rf src/app/backoffice/pricing-strategies/
rm -rf src/app/(org)/ai-planning/
rm -rf src/app/(org)/integrations/
rm -rf src/app/onboarding/
rm -rf src/app/whatsapp-onboarding-standalone/
rm -rf src/app/demo/
rm -rf src/app/wa-bridge/
rm -rf src/app/callback/
rm -rf src/app/api/ai/
rm -rf src/app/api/transactions/
rm -rf src/app/api/webhooks/
rm -rf src/app/api/v1/
```

---

## Phase 2: Delete Domain-Specific API Routers

### 2.1 Delete Router Files
```bash
# Campaigns
rm -f src/server/api/routers/campaigns.router.ts
rm -f src/server/api/routers/campaign-events.router.ts
rm -f src/server/api/routers/campaign-plan.router.ts
rm -f src/server/api/routers/creatives.router.ts
rm -f src/server/api/routers/promotions.router.ts
rm -f src/server/api/routers/promotion-messages.router.ts

# Customers
rm -f src/server/api/routers/customers.router.ts
rm -f src/server/api/routers/customer-migration.router.ts
rm -f src/server/api/routers/default-segments.router.ts
rm -f src/server/api/routers/segments.router.ts

# Products
rm -f src/server/api/routers/products.router.ts
rm -f src/server/api/routers/categories.router.ts
rm -f src/server/api/routers/tags.router.ts
rm -f src/server/api/routers/transaction-products.router.ts

# Workflows
rm -f src/server/api/routers/workflow.router.ts
rm -f src/server/api/routers/execution.router.ts
rm -f src/server/api/routers/queue-monitor.router.ts

# Credits
rm -f src/server/api/routers/credits.router.ts

# Other Domain
rm -f src/server/api/routers/outlets.router.ts
rm -f src/server/api/routers/transactions.router.ts
rm -f src/server/api/routers/loyalty.router.ts
rm -f src/server/api/routers/offers.router.ts
rm -f src/server/api/routers/strategies.router.ts
rm -f src/server/api/routers/business.router.ts
rm -f src/server/api/routers/onboarding.router.ts
rm -f src/server/api/routers/integrations.router.ts
rm -f src/server/api/routers/ai-planning.router.ts
rm -f src/server/api/routers/ai-prompts.router.ts
rm -f src/server/api/routers/ai-prompts-proxy.router.ts
rm -f src/server/api/routers/copilot-demo.router.ts
rm -f src/server/api/routers/whatsapp-auth.router.ts
rm -f src/server/api/routers/provider.router.ts
rm -f src/server/api/routers/dashboard.router.ts
```

### 2.2 Update root.ts
Remove all domain-specific router imports and registrations. Keep only:
- auth, user, userOrg, org, orgs
- role, permission
- theme, systemConfig, apiKeys
- settings (if exists)

---

## Phase 3: Delete Domain-Specific Components

```bash
# Domain components
rm -rf src/components/campaigns/
rm -rf src/components/campaign/
rm -rf src/components/creatives/
rm -rf src/components/customers/
rm -rf src/components/segments/
rm -rf src/components/products/
rm -rf src/components/tags/
rm -rf src/components/workflow/
rm -rf src/components/execution/
rm -rf src/components/credits/
rm -rf src/components/outlets/
rm -rf src/components/offers/
rm -rf src/components/integrations/
rm -rf src/components/onboarding/
rm -rf src/components/whatsapp/
rm -rf src/components/business/
rm -rf src/components/copilot/
rm -rf src/components/charts/
rm -rf src/components/debug/
```

---

## Phase 4: Delete Domain-Specific Services & Repositories

### 4.1 Delete Repositories
```bash
rm -f src/server/repos/campaign.repository.ts
rm -f src/server/repos/promotion.repository.ts
rm -f src/server/repos/creative.repository.ts
rm -f src/server/repos/customer.repository.ts
rm -f src/server/repos/customer-attribute.repository.ts
rm -f src/server/repos/merchantSegments.repository.ts
rm -f src/server/repos/aiSegments.repository.ts
rm -f src/server/repos/products.repository.ts
rm -f src/server/repos/categories.repository.ts
rm -f src/server/repos/strategy.repository.ts
rm -f src/server/repos/workflow.repository.ts
rm -f src/server/repos/transaction.repository.ts
rm -f src/server/repos/outlet.repository.ts
rm -f src/server/repos/offer.repository.ts
rm -f src/server/repos/onboarding.repository.ts
```

### 4.2 Delete Services
```bash
rm -rf src/server/services/queue/
rm -rf src/server/services/llm/
rm -rf src/server/services/whatsapp/
rm -rf src/server/credit-api/
rm -rf src/server/workflow-api/
rm -rf src/server/workers/

# Individual service files
rm -f src/server/services/ai-prompt.service.ts
rm -f src/server/services/ai-provider.service.ts
rm -f src/server/services/business-analysis.service.ts
rm -f src/server/services/customer-*.service.ts
rm -f src/server/services/oauth-refresh.service.ts
rm -f src/services/customer-*.service.ts
```

---

## Phase 5: Delete Domain-Specific Database Schemas

### 5.1 Delete Schema Files
```bash
# Campaigns
rm -f src/db/schema/campaigns.ts
rm -f src/db/schema/campaign-events.ts
rm -f src/db/schema/creatives.ts
rm -f src/db/schema/promotion-messages.ts
rm -f src/db/schema/promotions.ts
rm -f src/db/schema/workflow-promotion-configs.ts
rm -f src/db/schema/promotion-workflow-triggers.ts

# Customers
rm -f src/db/schema/customers.ts
rm -f src/db/schema/customer-attributes.ts
rm -f src/db/schema/customer-promotion-workflow-triggers.ts
rm -f src/db/schema/customer-migration.ts
rm -f src/db/schema/aiSegments.ts

# Products
rm -f src/db/schema/products.ts
rm -f src/db/schema/categories.ts
rm -f src/db/schema/tags.ts
rm -f src/db/schema/business-categories.ts
rm -f src/db/schema/transaction-products.ts

# Workflows
rm -f src/db/schema/workflow.ts
rm -f src/db/schema/workflow-registration-configs.ts
rm -f src/db/schema/workflow-transaction-configs.ts
rm -f src/db/schema/joined-segment-workflow-triggers.ts
rm -f src/db/schema/registration-workflow-triggers.ts
rm -f src/db/schema/transaction-workflow-triggers.ts

# Credits
rm -f src/db/schema/credits.ts
rm -f src/db/schema/api-usage-logs.ts

# Other
rm -f src/db/schema/outlets.ts
rm -f src/db/schema/transactions.ts
rm -f src/db/schema/loyalty.ts
rm -f src/db/schema/offers.ts
rm -f src/db/schema/strategies.ts
rm -f src/db/schema/business-profile.ts
rm -f src/db/schema/brand-assets.ts
rm -f src/db/schema/integrations.ts
rm -f src/db/schema/auth-accounts.ts
rm -f src/db/schema/ai-planning.ts
rm -f src/db/schema/ai-prompts.ts
rm -f src/db/schema/copilot-demo.ts
rm -f src/db/schema/whatsapp-template.ts
rm -f src/db/schema/revenue.ts
rm -f src/db/schema/message-send-history.ts
rm -f src/db/schema/segment-metadata.ts
rm -f src/db/schema/segments-new.ts
rm -f src/db/schema/provider.ts
rm -f src/db/schema/scraped-data.ts
rm -f src/db/schema/target-audiences.ts
```

### 5.2 Update src/db/schema/index.ts
Remove all deleted schema exports. Keep only:
- orgs, users (from org.ts)
- orgAuditLogs, orgSettings (from organizations.ts)
- roles, permissions, userRoles, rolePermissions (from rbac.ts)
- auditLogs (from audit.ts)
- themes (from theme.ts)
- apiKeys (from api-keys.ts)
- systemConfig (from system-config.ts)

---

## Phase 6: Delete Other Domain-Specific Files

### 6.1 Delete AI/External Folders
```bash
rm -rf ai/
rm -rf ai-api/
rm -rf lambda/
```

### 6.2 Delete Domain Documentation
```bash
rm -f N8N_INTEGRATION_GUIDE.md
rm -f WORKER_QUICKSTART.md
rm -f BO_API_TROUBLESHOOTING.md
rm -f BO_SETTINGS_FIELDS_ANALYSIS.md
rm -f COMPREHENSIVE_TYPES_UPDATE.md
rm -f OUTLET_SETTINGS_INTEGRATION.md
rm -f test-ai-caption.md
rm -f test-workflow-save.md
rm -f open-issues.md
```

### 6.3 Delete Docker Worker Files
```bash
rm -f Dockerfile.worker
rm -f docker-compose.worker.yml
rm -f docker-compose.prod-worker.yml
rm -f docker-compose.ai-api.yml
rm -f deploy-worker.sh
rm -f deploy-worker-v2.sh
rm -f rollback-worker.sh
```

---

## Phase 7: Update Configuration Files

### 7.1 Update Permissions Registry (src/permissions/registry.ts)
Remove domain-specific permission modules:
- campaigns, creatives, customers, segments
- products, categories, tags
- offers, loyalty, transactions, outlets
- workflows, integrations, promotions, strategies
- business, ai_planning, whatsapp

Keep only:
- admin, org, user, role, settings

### 7.2 Update Sidebar Navigation
Edit sidebar configuration to remove domain menu items. Keep:
- Dashboard (simple)
- Settings
- Users
- Roles
- System Admin / Backoffice

### 7.3 Update package.json
Remove domain-specific scripts:
- db:seed:ai-segments
- db:backfill:events
- db:migrate:transaction-statuses
- db:calculate:rfmp
- db:seed:prompts

### 7.4 Update .env.example
Remove:
- WhatsApp env vars
- AI/LLM env vars (OPENAI_*, ANTHROPIC_*, etc.)
- N8N/workflow vars
- Business-specific vars

Keep:
- DATABASE_* vars
- NEXTAUTH_* vars
- Basic config vars

---

## Phase 8: Clean Up and Regenerate

### 8.1 Update Types (src/types/)
Remove domain-specific type files and keep only core types.

### 8.2 Regenerate Migrations
```bash
# Option A: Fresh migrations
rm -rf drizzle/
pnpm db:migrate:generate

# Option B: Keep and update (more complex)
# Manually update drizzle/meta/_journal.json
```

### 8.3 Update Seed Scripts
Keep only core seeds:
- seed-rbac.ts
- seed-users.ts (or similar)

Remove domain-specific seeds.

---

## Phase 9: Validate and Test

### 9.1 Build Test
```bash
pnpm build
```

### 9.2 Database Test
```bash
pnpm db:full  # Fresh database setup
```

### 9.3 Fix Import Errors
Address any remaining import errors from deleted modules.

---

## Files to Keep (Core Infrastructure)

### Authentication & RBAC
- src/server/auth-simple.ts
- src/server/auth/
- src/server/api/routers/auth.router.ts
- src/server/api/routers/role.router.ts
- src/server/api/routers/permission.router.ts
- src/server/api/routers/user.router.ts
- src/server/api/routers/user-org.router.ts
- src/db/schema/rbac.ts

### Organization Management
- src/server/api/routers/org.router.ts
- src/server/api/routers/orgs.router.ts
- src/db/schema/org.ts
- src/db/schema/organizations.ts

### UI Components
- src/components/ui/ (all shadcn components)
- src/components/auth/
- src/components/roles/
- src/components/system/
- src/components/settings/
- src/components/theme/
- src/components/layout/
- src/components/Sidebar/
- src/components/shared/
- src/components/backoffice/

### App Routes
- src/app/(auth)/
- src/app/(org)/settings/
- src/app/(settings)/
- src/app/backoffice/system/
- src/app/api/auth/
- src/app/api/trpc/

### Infrastructure
- src/server/api/trpc.ts
- src/server/api/root.ts (modified)
- src/db/clients.ts
- src/db/index.ts
- src/middleware.ts
- src/lib/
- src/utils/
- src/hooks/
- src/permissions/
- src/framework/

---

## Incremental Validation Checkpoints

### After Each Phase - Run These Tests:

```bash
# 1. Build check (catches import errors)
pnpm build

# 2. Dev server check (catches runtime errors)
pnpm dev
# Then manually test:
# - Visit http://localhost:3000/login
# - Login with test user
# - Navigate to /backoffice
# - Check sidebar navigation works
```

### Critical Validation Points:

#### After Phase 2 (Router Deletion):
- [ ] `pnpm build` passes
- [ ] Can login at /login
- [ ] Session persists (check /api/auth/session)
- [ ] Can access /backoffice
- [ ] tRPC calls work (org.getCurrent, auth.getCurrentUser)

#### After Phase 5 (Schema Deletion):
- [ ] `pnpm build` passes
- [ ] `pnpm db:migrate:generate` works (if regenerating)
- [ ] Can create fresh database with `pnpm db:full`
- [ ] Login still works
- [ ] User/role queries work

#### After Phase 7 (Config Updates):
- [ ] `pnpm build` passes
- [ ] Sidebar shows only core menu items
- [ ] Permissions work (role:read, user:read, etc.)
- [ ] Backoffice pages load correctly

---

## Revised Execution Order (Incremental with Validation)

### Step 1: Delete App Routes (Safest First)
Delete frontend routes - these have minimal backend dependencies.
**Validate:** `pnpm build` + manual login test

### Step 2: Update root.ts FIRST, Then Delete Routers
Update root.ts to remove router registrations BEFORE deleting files.
**Validate:** `pnpm build` + tRPC calls work

### Step 3: Delete Components
Remove UI components for deleted features.
**Validate:** `pnpm build` + pages still render

### Step 4: Delete Services/Repos
Remove backend logic.
**Validate:** `pnpm build`

### Step 5: Delete Schemas + Update index.ts
**CRITICAL:** Update index.ts BEFORE deleting schema files.
**Validate:** `pnpm build` + database connection works

### Step 6: Delete Misc Files
Clean up docs, docker files, etc.
**Validate:** `pnpm build`

### Step 7: Update Configs (Sidebar, Permissions, etc.)
**Validate:** Full manual test of all core features

### Step 8: Regenerate Migrations
**Validate:** `pnpm db:full` works from scratch

---

## Rollback Strategy

If something breaks:
1. Git status to see what was deleted
2. `git checkout -- <file>` to restore specific files
3. Or `git stash` before each phase to save state

Recommend: Commit after each successful phase validation.

---

## Estimated Effort

| Phase | Description | Complexity | Validation |
|-------|-------------|------------|------------|
| 1 | Delete app routes | Low | Build + Login |
| 2 | Update root.ts + delete routers | Medium | Build + tRPC |
| 3 | Delete components | Low | Build + Render |
| 4 | Delete services/repos | Low | Build |
| 5 | Delete schemas + update index | Medium | Build + DB |
| 6 | Delete misc files | Low | Build |
| 7 | Update configs | Medium | Full Test |
| 8 | Regenerate migrations | Medium | DB Full |
| 9 | Final validation | High | All Features |

**Total: ~3-4 hours with incremental validation**
