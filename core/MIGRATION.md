# Migration Guide: SDK Component Factory Pattern

This guide helps you migrate from inline component implementations to the SDK's 3-tier factory pattern.

## Table of Contents

- [Overview](#overview)
- [Before/After Comparison](#beforeafter-comparison)
- [Step-by-Step Migration](#step-by-step-migration)
- [Creating an SDK Registry](#creating-an-sdk-registry)
- [Customizing Components](#customizing-components)
- [Common Migration Patterns](#common-migration-patterns)
- [Troubleshooting](#troubleshooting)

## Overview

### The 3-Tier Pattern

```
Tier 1: Logic Hook (SDK)
├── Contains all business logic, validation, state management
├── Accepts API callbacks (not tRPC directly)
└── Returns state + actions (completely UI-agnostic)

Tier 2: Factory Function (SDK)
├── Takes UI components + API via configuration
├── Uses logic hook internally
├── Renders UI using injected components
└── Returns configured React component

Tier 3: App Override (Your App)
├── Wires factory with your UI library (Shadcn, MUI, etc.)
├── Provides your API client (tRPC, REST, etc.)
└── Exports ready-to-use component
```

### Benefits

- **UI Independence**: Use any component library
- **API Flexibility**: Works with tRPC, REST, GraphQL
- **Type Safety**: Full TypeScript support
- **Testability**: Logic hooks can be unit tested
- **Maintainability**: Centralized SDK wiring

## Before/After Comparison

### Before: Inline Implementation

```tsx
// pages/users/page.tsx - 300+ lines of mixed concerns
"use client";

import { api } from "@/utils/trpc";
import { Dialog, Button, Input } from "@/components/ui";
import { useState } from "react";
import { toast } from "sonner";

export function UsersPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ firstName: "", lastName: "", ... });
  const [errors, setErrors] = useState({});

  const inviteMutation = api.user.invite.useMutation();
  const utils = api.useUtils();

  const validateForm = () => {
    // 50+ lines of validation logic
  };

  const handleSubmit = async () => {
    // 30+ lines of submission logic
    await inviteMutation.mutateAsync(formData);
    await utils.user.list.invalidate();
    toast.success("User created");
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Add User</Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        {/* 100+ lines of form UI */}
      </Dialog>
    </>
  );
}
```

**Problems:**
- Business logic mixed with UI
- Cannot reuse across pages
- Hard to test
- Duplicated validation across edit/create forms

### After: SDK Factory Pattern

```tsx
// src/sdk/users.ts - SDK wiring (one-time setup)
"use client";

import { createUserFormDialogFactory } from "@jetdevs/core/features/users/ui";
import { Dialog, Button, Input, ... } from "@/components/ui";
import { api } from "@/utils/trpc";
import { toast } from "sonner";

export const UserFormDialog = createUserFormDialogFactory({
  api: api as any,
  ui: {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter, Button, Input,
    Label, Switch, Badge, Select, SelectTrigger,
    SelectValue, SelectContent, SelectItem,
    toast: {
      success: (msg: string) => toast.success(msg),
      error: (msg: string) => toast.error(msg),
    },
  } as any,
});

export type { UserFormDialogProps } from "@jetdevs/core/features/users/ui";
```

```tsx
// pages/users/page.tsx - Clean page component
"use client";

import { UserFormDialog } from "@/sdk/users";
import { useState } from "react";

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

**Benefits:**
- Page is clean and focused
- SDK wiring is done once
- Logic is tested in SDK
- Consistent behavior across app

## Step-by-Step Migration

### Step 1: Install/Update SDK

```bash
pnpm add @jetdevs/core
```

Ensure SDK is built with UI exports:

```bash
cd core-sdk/core && pnpm build
```

### Step 2: Create SDK Registry Folder

```bash
mkdir -p src/sdk
```

Create `src/sdk/index.ts`:

```typescript
/**
 * SDK Registry - Central Export
 * Import configured components from '@/sdk'
 */

export * from "./users";
export * from "./organizations";
export * from "./api-keys";
export * from "./themes";
```

### Step 3: Create Module Files

#### Users (`src/sdk/users.ts`)

```typescript
"use client";

import {
  createUserFormDialogFactory,
  type UserFormDialogProps,
  type UserFormDialogUIComponents,
} from "@jetdevs/core/features/users/ui";
import { toast } from "sonner";

// UI Components from your design system
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue,
  SelectContent, SelectItem,
} from "@/components/ui/select";

// tRPC API
import { api } from "@/utils/trpc";

// Bundle UI components
const userFormDialogUI = {
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
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
  },
} as unknown as UserFormDialogUIComponents;

// Create configured component
export const UserFormDialog = createUserFormDialogFactory({
  api: api as any,
  ui: userFormDialogUI,
});

// Re-export types
export type { UserFormDialogProps };
export type {
  UserFormState,
  RoleData,
  EditUserData,
} from "@jetdevs/core/features/users/ui";
```

#### Organizations (`src/sdk/organizations.ts`)

```typescript
"use client";

import {
  createOrgSwitcherFactory,
  type OrgSwitcherProps,
  type OrgSwitcherUIComponents,
  type OrgSwitcherHooks,
} from "@jetdevs/core/features/organizations/ui";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { api } from "@/utils/trpc";

const orgSwitcherUI = {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  Button,
  Input,
  toast: {
    success: (message: string) => toast.success(message),
    error: (message: string) => toast.error(message),
  },
} as unknown as OrgSwitcherUIComponents;

const orgSwitcherHooks = {
  useSession: () => {
    const session = useSession();
    return { data: session.data, update: session.update };
  },
  useRouter: () => {
    const router = useRouter();
    return { push: router.push as (path: string) => void, back: router.back };
  },
} as OrgSwitcherHooks;

export const OrgSwitcher = createOrgSwitcherFactory({
  api: {
    getUserOrganizations: {
      useQuery: (input: any, options: any) => {
        // @ts-expect-error - tRPC types are complex
        const query = api.userOrg.getUserOrganizations.useQuery(input, options);
        return { data: query.data, isLoading: query.isLoading };
      },
    },
    switchOrg: {
      useMutation: () => {
        // @ts-expect-error - tRPC types are complex
        const mutation = api.userOrg.switchOrg.useMutation();
        return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
      },
    },
  },
  ui: orgSwitcherUI,
  hooks: orgSwitcherHooks,
  redirectPath: "/dashboard",
});

export type { OrgSwitcherProps };
```

#### API Keys (`src/sdk/api-keys.ts`)

```typescript
"use client";

import {
  createApiKeysListFactory,
  createCreateApiKeyDialogFactory,
  type ApiKeysListProps,
  type CreateApiKeyDialogProps,
  type ApiKeysListUIComponents,
  type CreateApiKeyDialogUIComponents,
} from "@jetdevs/core/features/api-keys/ui";
import { toast } from "sonner";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
  AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { api } from "@/utils/trpc";

const toastAdapter = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
};

export const ApiKeysList = createApiKeysListFactory({
  api: {
    apiKeys: {
      list: {
        useQuery: (input: any) => {
          // @ts-expect-error - tRPC types complex
          const query = api.apiKeys.list.useQuery(input);
          return { data: query.data, isLoading: query.isLoading, error: query.error };
        },
      },
      revoke: {
        useMutation: () => {
          // @ts-expect-error - tRPC types complex
          const mutation = api.apiKeys.revoke.useMutation();
          return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
        },
      },
    },
    useUtils: () => {
      const utils = api.useUtils();
      return {
        apiKeys: {
          list: {
            // @ts-expect-error - tRPC types complex
            invalidate: () => utils.apiKeys.list.invalidate(),
          },
        },
      };
    },
  },
  ui: {
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
    Button, Badge, Input,
    AlertDialog, AlertDialogContent, AlertDialogHeader,
    AlertDialogTitle, AlertDialogDescription, AlertDialogFooter,
    AlertDialogCancel, AlertDialogAction,
    toast: toastAdapter,
  } as unknown as ApiKeysListUIComponents,
});

export const CreateApiKeyDialog = createCreateApiKeyDialogFactory({
  api: {
    apiKeys: {
      create: {
        useMutation: () => {
          // @ts-expect-error - tRPC types complex
          const mutation = api.apiKeys.create.useMutation();
          return { mutateAsync: mutation.mutateAsync, isPending: mutation.isPending };
        },
      },
    },
    useUtils: () => {
      const utils = api.useUtils();
      return {
        apiKeys: {
          list: {
            // @ts-expect-error - tRPC types complex
            invalidate: () => utils.apiKeys.list.invalidate(),
          },
        },
      };
    },
  },
  ui: {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter, Button, Input, Label,
    Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
    toast: toastAdapter,
  } as unknown as CreateApiKeyDialogUIComponents,
});

export type { ApiKeysListProps, CreateApiKeyDialogProps };
```

### Step 4: Update Imports in Pages

Replace inline implementations with SDK imports:

```diff
- import { useState, useEffect } from "react";
- import { api } from "@/utils/trpc";
- import { Dialog, Button, ... } from "@/components/ui";
- import { toast } from "sonner";
+ import { UserFormDialog } from "@/sdk/users";
+ import { useState } from "react";
```

### Step 5: Remove Old Implementations

Delete the inline component code and replace with SDK component:

```tsx
// Before: 300+ lines
// After: ~20 lines

export function UsersPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  return (
    <>
      <UserFormDialog
        mode="create"
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        currentOrgId={orgId}
        availableRoles={roles}
      />

      <UserFormDialog
        mode="edit"
        open={!!editUser}
        onClose={() => setEditUser(null)}
        user={editUser}
        currentOrgId={orgId}
        availableRoles={roles}
        existingRoleAssignments={userRoles}
      />
    </>
  );
}
```

### Step 6: Configure Path Alias (Optional)

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/sdk/*": ["./src/sdk/*"],
      "@/sdk": ["./src/sdk"]
    }
  }
}
```

## Customizing Components

### Custom Toast Implementation

```typescript
// Using react-hot-toast instead of sonner
import { toast as hotToast } from "react-hot-toast";

const toastAdapter = {
  success: (message: string) => hotToast.success(message),
  error: (message: string) => hotToast.error(message),
};
```

### Custom API Adapter (REST)

```typescript
export const UserFormDialog = createUserFormDialogFactory({
  api: {
    user: {
      invite: {
        useMutation: () => {
          const [isPending, setIsPending] = useState(false);
          return {
            mutateAsync: async (data) => {
              setIsPending(true);
              const res = await fetch("/api/users", {
                method: "POST",
                body: JSON.stringify(data),
              });
              setIsPending(false);
              return res.json();
            },
          };
        },
      },
      // ... other methods
    },
    useUtils: () => ({
      user: {
        list: {
          invalidate: async () => {
            // Trigger SWR revalidation or similar
          },
        },
      },
    }),
  },
  ui: uiComponents,
});
```

### Using Logic Hook Directly

For maximum customization, bypass the factory:

```typescript
import { useUserFormLogic } from "@jetdevs/core/features/users/ui";

function MyCustomUserForm() {
  const logic = useUserFormLogic({
    mode: "create",
    isOpen: true,
    currentOrgId: 1,
    availableRoles: roles,
    onCreateUser: async (data) => api.user.invite.mutateAsync(data),
    onUpdateUser: async (data) => api.user.update.mutateAsync(data),
    onAssignRole: async (data) => api.userOrg.assignRole.mutateAsync(data),
    onRemoveRole: async (data) => api.userOrg.removeRole.mutateAsync(data),
    onSuccess: () => toast.success("Saved!"),
    onClose: () => setOpen(false),
  });

  // Complete control over UI
  return (
    <MyCustomDialog>
      <MyCustomInput
        value={logic.formData.firstName}
        onChange={(v) => logic.setFormField("firstName", v)}
        error={logic.errors.firstName}
      />
      {/* ... */}
    </MyCustomDialog>
  );
}
```

## Common Migration Patterns

### Pattern 1: DataTable with Actions

```tsx
// Before
<DataTable
  columns={[...]}
  data={users}
  onEdit={(user) => setEditUser(user)}
  onDelete={(user) => handleDelete(user)}
/>

// After
import { UserDataTable } from "@/sdk/users";

<UserDataTable
  onEdit={(user) => setEditUser(user)}
  onDelete={(user) => handleDelete(user)}
/>
```

### Pattern 2: Create/Edit Dialog Pair

```tsx
// Use same component for both modes
<UserFormDialog mode="create" {...createProps} />
<UserFormDialog mode="edit" user={selectedUser} {...editProps} />
```

### Pattern 3: Conditional Features

```tsx
export const UserFormDialog = createUserFormDialogFactory({
  api: api as any,
  ui: uiComponents,
  // Factory-level configuration (if supported)
  showPasswordField: process.env.AUTH_TYPE === "password",
});
```

## Troubleshooting

### "Module not found" Errors

Ensure SDK is built:

```bash
cd core-sdk/core && pnpm build
```

### Type Errors with UI Components

Use type assertions for Shadcn components (they use forwardRef):

```typescript
const ui = {
  Dialog,
  Button,
  // ...
} as unknown as UserFormDialogUIComponents;
```

### tRPC Type Errors

Use `// @ts-expect-error` comments for complex tRPC types:

```typescript
// @ts-expect-error - tRPC types are complex, router exists at runtime
const query = api.user.list.useQuery();
```

### "use client" Errors

Ensure SDK registry files have `"use client"` directive at the top:

```typescript
"use client";

import { createUserFormDialogFactory } from "@jetdevs/core/features/users/ui";
```

### API Shape Mismatches

If your API routes differ, create inline adapters:

```typescript
api: {
  user: {
    invite: {
      useMutation: () => {
        // Map to your actual API route
        const mutation = api.users.create.useMutation();
        return {
          mutateAsync: async (data) => {
            // Transform data if needed
            return mutation.mutateAsync({
              ...data,
              name: `${data.firstName} ${data.lastName}`,
            });
          },
        };
      },
    },
  },
}
```

## Checklist

- [ ] Install/update @jetdevs/core
- [ ] Create src/sdk/ folder
- [ ] Create module files (users.ts, themes.ts, etc.)
- [ ] Wire factories with your UI components
- [ ] Create central index.ts export
- [ ] Update page imports to use @/sdk
- [ ] Remove old inline implementations
- [ ] Test all migrated components
- [ ] Update TypeScript path aliases (optional)
