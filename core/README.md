# @jetdevs/core

Multi-tenant SaaS SDK with UI-agnostic component factories.

## Overview

This SDK provides pre-built business logic and UI factories for common SaaS features:

- **Users** - User management, invitations, role assignments
- **Organizations** - Multi-tenancy, org switching
- **API Keys** - API key generation and management
- **Themes** - Theme management and customization
- **RBAC** - Role-based access control

## Installation

```bash
pnpm add @jetdevs/core
```

## Architecture: 3-Tier Factory Pattern

The SDK uses a 3-tier pattern that separates business logic from UI components:

```
Tier 1: Logic Hook (SDK)
├── useUserFormLogic.ts - All business logic, validation, state
├── Accepts callbacks for API operations
└── Returns state + actions (UI-agnostic)

Tier 2: Factory Function (SDK)
├── createUserFormDialogFactory.tsx
├── Accepts UI components + API client via config
├── Uses logic hook internally
└── Returns configured React component

Tier 3: App Override (Consumer App)
├── src/sdk/users.ts - Wires factory with your UI + API
├── Imports from @jetdevs/core/features/users
└── Exports ready-to-use component
```

### Why This Pattern?

1. **UI Flexibility** - Use any UI library (Shadcn, MUI, custom)
2. **API Agnostic** - Works with tRPC, REST, GraphQL
3. **Testability** - Logic hooks can be tested independently
4. **Tree Shaking** - Import only what you need
5. **Type Safety** - Full TypeScript support throughout

## Quick Start

### 1. Create SDK Registry

Create `src/sdk/users.ts` in your app:

```typescript
"use client";

import { createUserFormDialogFactory } from "@jetdevs/core/features/users/ui";
import { Dialog, DialogContent, Button, Input, ... } from "@/components/ui";
import { api } from "@/utils/trpc";
import { toast } from "sonner";

// Bundle your UI components
const ui = {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
  Switch,
  Badge,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  toast: {
    success: (msg: string) => toast.success(msg),
    error: (msg: string) => toast.error(msg),
  },
};

// Create configured component
export const UserFormDialog = createUserFormDialogFactory({
  api: api as any,
  ui: ui as any,
});

// Re-export types
export type { UserFormDialogProps } from "@jetdevs/core/features/users/ui";
```

### 2. Use in Your Pages

```tsx
import { UserFormDialog } from "@/sdk/users";

export function UsersPage() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Add User</Button>
      <UserFormDialog
        mode="create"
        open={isOpen}
        onClose={() => setIsOpen(false)}
        currentOrgId={orgId}
        availableRoles={roles}
      />
    </>
  );
}
```

## Feature Modules

### Users

```typescript
import {
  createUserFormDialogFactory,
  createUserDataTableFactory,
  createDeleteUserDialogFactory,
  useUserFormLogic,  // Direct hook access
} from "@jetdevs/core/features/users/ui";
```

### Organizations

```typescript
import {
  createOrgSwitcherFactory,
} from "@jetdevs/core/features/organizations/ui";
```

### API Keys

```typescript
import {
  createApiKeysListFactory,
  createCreateApiKeyDialogFactory,
} from "@jetdevs/core/features/api-keys/ui";
```

### Themes

```typescript
import {
  createThemeFormDialogFactory,
  createThemesDataTableFactory,
} from "@jetdevs/core/features/themes/ui";
```

## Import Paths

Each feature can be imported from:

```typescript
// Full feature (backend + UI)
import { ... } from "@jetdevs/core/features/users";

// UI only (factories + hooks)
import { ... } from "@jetdevs/core/features/users/ui";

// Backend only (if available)
import { ... } from "@jetdevs/core/features/users/backend";
```

## SDK Registry Pattern

We recommend creating an SDK registry folder in your app:

```
src/sdk/
├── index.ts       # Central re-exports
├── users.ts       # User components
├── organizations.ts
├── api-keys.ts
└── themes.ts
```

This pattern provides:

1. **Single source of truth** for SDK wiring
2. **Easy imports** via `@/sdk`
3. **Centralized customization**
4. **Clear separation** from app code

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.

## Type Safety

All factories are fully typed. You can import types for props:

```typescript
import type {
  UserFormDialogProps,
  UserFormState,
  RoleData,
} from "@jetdevs/core/features/users/ui";
```

## Using Logic Hooks Directly

For advanced customization, use the logic hooks directly:

```typescript
import { useUserFormLogic } from "@jetdevs/core/features/users/ui";

function CustomUserForm() {
  const logic = useUserFormLogic({
    mode: "create",
    isOpen: true,
    currentOrgId: 1,
    availableRoles: [],
    onCreateUser: async (data) => { /* your API */ },
    onUpdateUser: async (data) => { /* your API */ },
    onAssignRole: async (data) => { /* your API */ },
    onRemoveRole: async (data) => { /* your API */ },
    onClose: () => setOpen(false),
  });

  // Build completely custom UI using logic state/actions
  return (
    <form>
      <input
        value={logic.formData.firstName}
        onChange={(e) => logic.setFormField("firstName", e.target.value)}
      />
      {logic.errors.firstName && <span>{logic.errors.firstName}</span>}
      <button onClick={logic.handleSubmit}>Submit</button>
    </form>
  );
}
```

## Development

```bash
# Build SDK
pnpm build

# Watch mode
pnpm dev

# Type check
pnpm typecheck
```

## License

MIT
