# Consolidated SDK Migration Plan

**Created:** 2025-11-29
**Status:** Active - Single Source of Truth
**Last Updated:** 2025-11-29

---

## Executive Summary

This document consolidates the migration of `apps/saas-core-v2/` from a monolithic app to a minimal reference implementation that demonstrates SDK usage. The goal is to move reusable code to `@jetdevs/core` and reduce the app to app-specific business logic only.

### Progress Overview

| Phase | Status | Progress |
|-------|--------|----------|
| Phase 1: framework/ Cleanup | COMPLETED | 100% |
| Phase 2: hooks/ Cleanup | COMPLETED | 100% |
| Phase 3: stores/ Cleanup | COMPLETED | 100% |
| Phase 4: lib/ Cleanup | COMPLETED | 100% |
| Phase 5: utils/ Cleanup | COMPLETED | 100% |
| Phase 6: Directory Consolidation | COMPLETED | 100% |
| Phase 7: SDK Admin Pages | COMPLETED | 100% |
| Phase 8: SDK Role Dialogs | COMPLETED | 100% |
| Phase 9: SDK DataTable Factory | COMPLETED | 100% |
| Phase 10: Remaining Cleanup | IN PROGRESS | 70% |

**Total Lines Removed from App:** ~2,500+ lines
**Total Files Deleted:** 30+ files

---

## Current App Structure (After Cleanup)

```
apps/saas-core-v2/src/
├── app/                    # Next.js App Router pages
├── components/             # UI components
├── config/                 # Consolidated configuration (NEW)
│   ├── constants.ts
│   ├── theme.ts
│   └── index.ts
├── db/                     # Database schema and seeds
├── extensions/             # App-specific extensions
├── hooks/                  # App-specific hooks (5 files - NextAuth dependent)
├── lib/                    # App-specific utilities (reduced)
├── middleware.ts           # Next.js middleware
├── modules/                # Feature modules
├── permissions/            # App permissions (merges with SDK)
├── providers/              # React providers
├── schemas/                # Zod schemas
├── server/                 # Server code
│   ├── api/                # tRPC routers
│   ├── lib/                # Server-only utilities (NEW)
│   │   ├── aws-s3.ts
│   │   ├── email.ts
│   │   ├── rate-limit.ts
│   │   └── redis.ts
│   ├── repos/              # Repositories
│   └── services/           # Services
├── services/               # Client services
├── stores/                 # Zustand stores (3 files - app-specific)
├── styles/                 # CSS
├── types/                  # TypeScript types
└── utils/                  # Client utilities (6 files - includes tRPC client)
```

---

## Phase 1: Delete framework/ Directory - COMPLETED

**Status:** COMPLETED
**Files Deleted:** 34 files

The entire `src/framework/` directory was deleted as all functionality was duplicated in the SDK.

### Import Updates Applied

| Old Import | New SDK Import |
|------------|----------------|
| `~/framework/hooks/useTable` | `@jetdevs/core/hooks` |
| `~/framework/hooks/useModalState` | `@jetdevs/core/hooks` |
| `~/framework/hooks/useIsClient` | `@jetdevs/core/hooks` |
| `~/framework/store/auth.store` | `@jetdevs/core/stores` |
| `~/framework/store/ui.store` | `@jetdevs/core/stores` |
| `~/framework/lib/utils` | `@jetdevs/core/lib` |
| `~/framework/types/*` | `@jetdevs/core/types` |

---

## Phase 2: Cleanup hooks/ Directory - COMPLETED

**Status:** COMPLETED
**Files Deleted:** 4 files
**Files Remaining:** 5 (app-specific, NextAuth dependent)

### Files Deleted

| File | SDK Replacement |
|------|-----------------|
| `useHorizontalScroll.ts` | `@jetdevs/core/hooks` |
| `use-debounce.ts` | `@jetdevs/core/hooks` -> useDebounce |
| `useMediaQuery.ts` | `@jetdevs/core/hooks` -> useMediaQuery, BREAKPOINT_QUERIES |
| `useViewToggle.ts` | `@jetdevs/core/hooks` -> useViewToggle |

### Files Kept (App-Specific)

| File | Reason |
|------|--------|
| `useAuthSession.ts` | Uses NextAuth useSession, ExtendedSession/User types |
| `usePermissions.ts` | Uses @/stores/permissionStore, @/types/permissions |
| `useOrgChangeDetector.ts` | Uses @/utils/trpc |
| `usePermissionMonitor.ts` | Uses @/utils/trpc, @/lib/websocket-permissions |
| `useStablePolling.ts` | Generic, can migrate later |

---

## Phase 3: Cleanup stores/ Directory - COMPLETED

**Status:** COMPLETED
**Files Deleted:** 1 file (theme.store.ts)
**Files Remaining:** 3 (app-specific)

### File Deleted

| File | SDK Replacement |
|------|-----------------|
| `theme.store.ts` | `@jetdevs/core/stores` -> useThemeStore |

### Files Kept (App-Specific)

| File | Reason |
|------|--------|
| `auth.store.ts` | Uses NextAuth, @/lib/websocket-permissions |
| `permissionStore.ts` | Uses @/types/permissions |
| `orgSwitchStore.ts` | Small (15 lines), org switching state |

---

## Phase 4: Cleanup lib/ Directory - COMPLETED

**Status:** COMPLETED
**Files Deleted:** 6 files
**Files Moved:** 4 files to server/lib/

### Files Deleted

| File | SDK Replacement |
|------|-----------------|
| `country-codes.ts` | `@jetdevs/core/lib` -> countryCodes |
| `formatDate.ts` | `@jetdevs/core/lib` -> formatDate |
| `generate-id.ts` | `@jetdevs/core/lib` -> generateId |
| `theme-manager.ts` | `@jetdevs/core/lib` |
| `token-blacklist.ts` | `@jetdevs/core/auth` -> tokenBlacklist |
| `logger.ts` | Unused |
| `theme-loader.ts` | SDK provides theme utilities |

### Files Moved to server/lib/

| File | New Location |
|------|--------------|
| `aws-s3.ts` | `server/lib/aws-s3.ts` |
| `email.ts` | `server/lib/email.ts` |
| `redis.ts` | `server/lib/redis.ts` |
| `rate-limit.ts` | `server/lib/rate-limit.ts` |

### Files Kept (App-Specific)

| File | Reason |
|------|--------|
| `api/` | API error handling |
| `api-auth.ts` | Auth API endpoints |
| `audit.ts` | Audit logging |
| `auth-errors.ts` | Auth error handling |
| `logout-helper.ts` | Logout helpers |
| `real-time-permissions.ts` | Real-time permission updates |
| `session-invalidation.ts` | Session management |
| `trpc-permissions.ts` | tRPC permission checking |
| `user-role-operations.ts` | User role operations |
| `websocket-permissions.ts` | WebSocket permission updates |
| `utils.ts` | Re-exports from SDK with additions |

---

## Phase 5: Cleanup utils/ Directory - COMPLETED

**Status:** COMPLETED
**Files Deleted:** 2 files
**Files Remaining:** 6 (app-specific)

### Files Deleted

| File | SDK Replacement |
|------|-----------------|
| `formatters.ts` | `@jetdevs/core/lib` -> formatCurrency, formatDate, formatNumber |
| `org.ts` | Empty/trivial (4 lines of comments) |

### Files Kept (App-Specific)

| File | Reason |
|------|--------|
| `trpc.ts` | Required for tRPC client setup |
| `currency.ts` | Extensive multi-currency support (17KB) |
| `func.ts` | App-specific utilities |
| `image.ts` | Image processing with Jimp |
| `mediaAPIFunc.ts` | Media API helpers |
| `permission-mapping.ts` | Human-readable to slug permission mapping |

---

## Phase 6: Directory Consolidation - COMPLETED

**Status:** COMPLETED

### Directories Deleted (After Moving Contents)

| Directory | Action |
|-----------|--------|
| `constants/` | Moved to `config/constants.ts` |
| `themes/` | Moved to `config/theme.ts` |
| `trpc/` | Was unused, deleted |
| `contexts/` | Moved FormSubmissionContext.tsx to `components/providers/` |

### Import Updates Applied

| Old Import | New Import |
|------------|------------|
| `@/constants/roles` | `@/config/constants` |
| `@/constants/general` | `@/config/constants` |
| `@/constants/api` | `@/config/constants` |
| `@/themes/themes.config` | `@/config/theme` |
| `@/contexts/FormSubmissionContext` | `@/components/providers/FormSubmissionContext` |

---

## Phase 7: SDK Admin Pages - COMPLETED

**Status:** COMPLETED

### SDK Components Created

#### ThemeManagementPage Factory

**Location:** `packages/core/src/ui/admin/ThemeManagementPage.tsx`

Features:
- Lists all themes with search/filter
- Shows stats (total, active, default)
- CRUD operations via dialogs
- Built-in SVG icons

**App Code Reduction:** 571 lines -> 57 lines (90% reduction)

#### PermissionManagementPage Factory

**Location:** `packages/core/src/ui/admin/PermissionManagementPage.tsx`

Features:
- Lists all permissions with search/filter by name, slug, description
- Category-based filtering via dropdown
- CSV export functionality
- Analytics tab with statistics

**App Code Reduction:** 277 lines -> 59 lines (79% reduction)

### Code Reduction Summary

| Page | Before | After | Reduction |
|------|--------|-------|-----------|
| Themes | 571 lines | 57 lines | 90% |
| Permissions | 277 lines | 59 lines | 79% |
| **Total** | **848 lines** | **116 lines** | **86%** |

---

## Phase 8: SDK Role Dialogs - COMPLETED

**Status:** COMPLETED

### SDK Components Created

**Location:** `packages/core/src/ui/admin/RoleDialogs.tsx`

1. **createDeleteRoleDialogFactory**
   - Shows role name and impact (user count, permission count)
   - Prevents deletion of system roles
   - Shows warning for roles with active users

2. **createBulkDeleteDialogFactory**
   - Filters out system roles with warning
   - Shows list of roles to delete with stats
   - Impact summary

3. **createCreateRoleDialogFactory**
   - 2-step wizard: Basic Information -> Review & Create
   - Form fields: name, description, isActive
   - Client-side validation

### Code Reduction Summary

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| DeleteRoleDialog | 193 lines | 43 lines | 78% |
| BulkDeleteDialog | 146 lines | 38 lines | 74% |
| CreateRoleDialog | 291 lines | 47 lines | 84% |
| **Total** | **630 lines** | **128 lines** | **80%** |

### App Files Updated

- 6 dialog files total (3 in backoffice/system/roles, 3 in (settings)/roles)

---

## Phase 9: SDK DataTable Factory - COMPLETED

**Status:** COMPLETED

### SDK Component Used

**Component:** `createDataTableWithToolbar` from `@jetdevs/core/ui/data-table`

Features:
- Generic data table with toolbar
- Search, filter, sort functionality
- Bulk action support
- Column visibility toggles
- Custom selection info

### RoleDataTable Migration

Both RoleDataTable components (backoffice and settings) migrated to use the SDK factory.

**Code Reduction:** 557 lines -> 196 lines per file (65% reduction)

---

## Phase 10: Remaining Cleanup - IN PROGRESS

**Status:** IN PROGRESS (70%)

### Remaining Work

#### permissions/ Directory

| File | Status | Action |
|------|--------|--------|
| `registry.ts` | KEEP | Source of truth for app permissions |
| `modules/*.ts` | KEEP | App-specific permission modules |
| `index.ts` | KEEP | Exports |

**Reason to Keep:** The permissions directory merges SDK core permissions with app-specific permissions. This is the intended pattern.

#### server/api/routers/ Directory

| Router | Status | Notes |
|--------|--------|-------|
| `theme.router.ts` | DELETED | Uses SDK's themeRouterConfig |
| `permission.router.ts` | KEEP | App-specific queries |
| `role.router.ts` | KEEP | Complex, app-specific |
| `user.router.ts` | KEEP | Complex, app-specific |
| `organization.router.ts` | KEEP | Complex, app-specific |
| Others | KEEP | App-specific features |

#### server/repos/ Directory

| Repository | Status | Notes |
|------------|--------|-------|
| `theme.repository.ts` | DELETED | SDK provides SDKThemeRepository |
| Others | KEEP | App-specific data access |

#### Dead Code Deleted

| Files | Lines |
|-------|-------|
| `RolePermissionsDialog.tsx` (x2) | ~400 lines |
| `RoleFormDialog.tsx` (x2) | ~432 lines |
| **Total Dead Code** | **~832 lines** |

---

## SDK Components Now Available

### Hooks (from @jetdevs/core/hooks)

- `useTable`, `useTableState`, `useTableSort`, `useTableFilter`, `useTableSearch`
- `useTableSelection`, `useTableExport`, `useTablePagination`, `useTableVisibility`
- `useModalState`, `useIsClient`
- `useDebounce`, `useMediaQuery`, `useViewToggle`, `BREAKPOINT_QUERIES`
- `useHorizontalScroll`

### Stores (from @jetdevs/core/stores)

- `useThemeStore`
- `useUIStore`
- `useAuthStore` (factory)

### UI Components (from @jetdevs/core/ui)

- `ThemeToggle`, `ThemeToggleThreeState`
- `createDataTableWithToolbar`

### Admin Page Factories (from @jetdevs/core/ui/admin)

- `createThemeManagementPage`
- `createPermissionManagementPage`
- `createDeleteRoleDialogFactory`
- `createBulkDeleteDialogFactory`
- `createCreateRoleDialogFactory`
- `createManagePermissionsMatrixFactory`
- `createManagePermissionsDialogFactory`

### Router Configs (from @jetdevs/core/trpc/routers)

- `themeRouterConfig`

### Utilities (from @jetdevs/core/lib)

- `cn`, `generateId`
- `formatDate`, `formatCurrency`, `formatNumber`
- `countryCodes`
- `logger`

---

## Critical Lessons Learned

### 1. Tailwind Arbitrary Values in SDK Packages

**Problem:** Tailwind arbitrary values (e.g., `grid-cols-[minmax(0,1fr)_auto]`) don't work in pre-compiled SDK packages because Tailwind scans source files at build time.

**Solution:** Use inline styles for layout-critical CSS:
```typescript
// Instead of: className="grid-cols-[minmax(0,1fr)_auto]"
style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}
```

**Type Updates Required:**
```typescript
interface ComponentProps {
  style?: React.CSSProperties;
}
```

### 2. ScrollArea Component Issues

**Problem:** Radix ScrollArea doesn't work well for horizontal scrolling in SDK components.

**Solution:** Replace ScrollArea with native div for horizontal layouts:
```typescript
<div className="overflow-x-auto">
  {content}
</div>
```

### 3. Client Component Boundary Issues

**Problem:** SDK's main export bundles client and server code together. When layout.tsx (server component) imports from SDK, it pulls in client-side React hooks.

**Solution:**
- Use specific import paths: `@jetdevs/core/stores` instead of `@jetdevs/core`
- Keep thin client wrappers with `"use client"` for server layouts

### 4. next-themes Compatibility

**Problem:** SDK's custom ThemeProvider conflicts with Next.js server/client boundaries.

**Solution:** Keep a thin wrapper using `next-themes` in the app:
```typescript
"use client"
import { ThemeProvider as NextThemesProvider } from "next-themes"
export function ThemeProvider({ children, ...props }) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
```

---

## Not Suitable for SDK Migration

The following pages were assessed and found NOT suitable for the factory pattern:

### Users Page (~950+ lines total)

- Complex DataTable with @tanstack/react-table
- Massive UserFormDialog (47KB)
- BulkUserOperationsDialog (400+ lines)
- App-specific `UserWithStats` types

### Roles Page (~1,100+ lines total)

- Complex DataTable with bulk operations
- EditRoleDialog with user assignment
- ManagePermissionsDialog with permission matrix
- App-specific role types

### Organizations Page (~760+ lines total)

- Complex DataTable
- OrganizationDetailsDialog (34KB) with user management
- App-specific organization types

**Reasons:**
1. Component explosion - 10+ UI component interfaces needed
2. State complexity - 6+ state hooks per page
3. App-specific types throughout
4. Deeply nested dependencies
5. Diminishing returns - migration cost exceeds benefits

---

## Import Cheatsheet

After migration, use these SDK imports:

```typescript
// ========== HOOKS ==========
import {
  useTable, useTableFilter, useTableSort, useTableSearch,
  useIsClient, useModalState,
  useDebounce, useMediaQuery, useViewToggle, BREAKPOINT_QUERIES,
  useHorizontalScroll,
} from '@jetdevs/core/hooks';

// ========== STORES ==========
import {
  useAuthStore, usePermissionStore, useUIStore, useThemeStore,
} from '@jetdevs/core/stores';

// ========== UI COMPONENTS ==========
import {
  ThemeToggle, ThemeToggleThreeState,
  createDataTableWithToolbar,
} from '@jetdevs/core/ui';

// ========== ADMIN PAGES ==========
import {
  createThemeManagementPage,
  createPermissionManagementPage,
  createDeleteRoleDialogFactory,
  createBulkDeleteDialogFactory,
  createCreateRoleDialogFactory,
} from '@jetdevs/core/ui/admin';

// ========== UTILITIES ==========
import {
  cn, generateId, logger,
  formatDate, formatCurrency, formatNumber,
  countryCodes,
} from '@jetdevs/core/lib';

// ========== tRPC ROUTERS ==========
import {
  themeRouterConfig,
  SDKThemeRepository,
} from '@jetdevs/core/trpc/routers';
```

---

## Success Criteria

| Criteria | Status |
|----------|--------|
| framework/ directory deleted | COMPLETED |
| hooks/ reduced to app-specific | COMPLETED |
| stores/ reduced to app-specific | COMPLETED |
| lib/ reduced to app-specific | COMPLETED |
| utils/ reduced to app-specific | COMPLETED |
| config/ directory created | COMPLETED |
| SDK admin pages working | COMPLETED |
| SDK role dialogs working | COMPLETED |
| SDK data table working | COMPLETED |
| Build passes | COMPLETED |
| No runtime errors | COMPLETED |

---

## Next Steps (Future Phases)

1. **Consider SDK migration for:**
   - Additional simpler admin pages
   - Common form components
   - Notification system

2. **Not planned for SDK:**
   - Complex DataTable pages (Users, Roles, Organizations)
   - App-specific business logic modules
   - Feature-specific components

3. **Documentation:**
   - Update SDK README with new exports
   - Create example app documentation
   - Document factory pattern usage

---

## Reference Documents

- Architecture Plan: `02-architecture-plan.md`
- Contracts: `05-contracts.md`
- Migration Guide: `03-migration-guide.md`
- Session Notes: `ai/sessions/2025-11-29-sdk-phase3.md`

---

*This document is the single source of truth for SDK migration progress. Previous documents (`app-cleanup-migration-plan.md`, `07-migration-task-plan.md`) are archived for reference only.*
