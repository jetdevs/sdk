"use client";

/**
 * User Form Dialog Factory
 *
 * Factory function for creating user form dialogs.
 * Apps create dialog components using factory functions that accept their tRPC client and UI components.
 *
 * @module @jetdevs/core/features/users/ui/factories
 *
 * @example
 * ```typescript
 * // Create user form dialog
 * import { createUserFormDialogFactory } from '@jetdevs/core/features/users/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const UserFormDialog = createUserFormDialogFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 *
 * // Usage
 * <UserFormDialog
 *   mode="create"
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   currentOrgId={1}
 *   availableRoles={roles}
 * />
 * ```
 */

import * as React from "react";
import {
  useUserFormLogic,
  type UserFormState,
  type UserRoleAssignmentDisplay,
  type RoleData,
  type UserFormOrgData,
  type EditUserData,
} from "../hooks/useUserFormLogic";
import type { SimpleToastInterface } from "../../../shared/types/toast";

// =============================================================================
// TYPES
// =============================================================================

/**
 * UI components required for UserFormDialog
 */
export interface UserFormDialogUIComponents {
  /** Root dialog component */
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  /** Dialog content wrapper */
  DialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog header section */
  DialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog title */
  DialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog description text */
  DialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog footer section */
  DialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  /** Button component */
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Text input component */
  Input: React.ComponentType<{
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    className?: string;
    type?: string;
  }>;
  /** Label component */
  Label: React.ComponentType<{
    htmlFor?: string;
    children: React.ReactNode;
  }>;
  /** Toggle switch component */
  Switch: React.ComponentType<{
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }>;
  /** Badge component */
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  /** Select root component */
  Select: React.ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  /** Select trigger */
  SelectTrigger: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Select value display */
  SelectValue: React.ComponentType<{
    placeholder?: string;
  }>;
  /** Select content dropdown */
  SelectContent: React.ComponentType<{
    children: React.ReactNode;
  }>;
  /** Select item option */
  SelectItem: React.ComponentType<{
    value: string;
    children: React.ReactNode;
  }>;
  /** Toast notifications */
  toast: SimpleToastInterface;
}

/**
 * API interface for UserFormDialog
 * Matches tRPC patterns with useUtils() for cache invalidation
 */
export interface UserFormDialogApi {
  user: {
    invite: {
      useMutation: () => {
        mutateAsync: (data: {
          firstName: string;
          lastName: string;
          email: string;
          phone?: string;
          username: string;
          password: string;
          isActive: boolean;
        }) => Promise<{ id: number; message?: string }>;
      };
    };
    update: {
      useMutation: () => {
        mutateAsync: (data: {
          id: number;
          firstName: string;
          lastName: string;
          email: string;
          phone?: string;
          username: string;
          password?: string;
          isActive: boolean;
        }) => Promise<void>;
      };
    };
  };
  userOrg: {
    assignRole: {
      useMutation: () => {
        mutateAsync: (data: {
          userId: number;
          roleId: number;
          orgId: number;
        }) => Promise<void>;
      };
    };
    removeRole: {
      useMutation: () => {
        mutateAsync: (data: {
          userId: number;
          roleId: number;
          orgId: number;
        }) => Promise<void>;
      };
    };
  };
  useUtils: () => {
    user: {
      list: {
        invalidate: () => Promise<void>;
      };
    };
    userOrg: {
      getRolesForUser: {
        invalidate: (params?: { userId: number }) => Promise<void>;
      };
    };
  };
}

/**
 * Factory configuration for UserFormDialog
 */
export interface UserFormDialogFactoryConfig {
  /** API client (tRPC-compatible) */
  api: UserFormDialogApi;
  /** UI components */
  ui: UserFormDialogUIComponents;
}

/**
 * Props for UserFormDialog component
 */
export interface UserFormDialogProps {
  /** Mode: create or edit */
  mode: "create" | "edit";
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** Callback on successful submission */
  onSuccess?: () => void;
  /** User data for edit mode */
  user?: EditUserData | null;
  /** Current organization ID */
  currentOrgId: number | null;
  /** Current organization data */
  currentOrg?: UserFormOrgData | null;
  /** Available roles for assignment */
  availableRoles: RoleData[];
  /** Whether roles are loading */
  rolesLoading?: boolean;
  /** User's existing role assignments (edit mode) */
  existingRoleAssignments?: UserRoleAssignmentDisplay[];
  /** Whether existing roles are loading */
  existingRolesLoading?: boolean;
}

// =============================================================================
// ICONS
// =============================================================================

const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const UserPlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" x2="19" y1="8" y2="14" />
    <line x1="22" x2="16" y1="11" y2="11" />
  </svg>
);

const LoaderIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`animate-spin ${className}`}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const EyeIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
    <line x1="2" x2="22" y1="2" y2="22" />
  </svg>
);

const RefreshIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="ml-2"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const ChevronLeftIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mr-2"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const PlusIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const XIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const ShieldIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

// =============================================================================
// UTILITY
// =============================================================================

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a UserFormDialog component
 *
 * Factory function that creates a user form dialog component
 * with injected API client and UI components.
 *
 * @param config - Factory configuration with API and UI components
 * @returns UserFormDialog component
 *
 * @example
 * ```typescript
 * const UserFormDialog = createUserFormDialogFactory({
 *   api,
 *   ui: { Dialog, DialogContent, ..., toast },
 * });
 *
 * // In component
 * <UserFormDialog
 *   mode="create"
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   currentOrgId={orgId}
 *   availableRoles={roles}
 * />
 * ```
 */
export function createUserFormDialogFactory(
  config: UserFormDialogFactoryConfig
) {
  const { api, ui } = config;
  const {
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
    toast,
  } = ui;

  return function UserFormDialog({
    mode,
    open,
    onClose,
    onSuccess,
    user,
    currentOrgId,
    currentOrg,
    availableRoles,
    rolesLoading = false,
    existingRoleAssignments,
    existingRolesLoading = false,
  }: UserFormDialogProps) {
    // API mutations
    const inviteUserMutation = api.user.invite.useMutation();
    const updateUserMutation = api.user.update.useMutation();
    const assignRoleMutation = api.userOrg.assignRole.useMutation();
    const removeRoleMutation = api.userOrg.removeRole.useMutation();
    const utils = api.useUtils();

    // Use the headless hook for all form logic
    const formLogic = useUserFormLogic({
      mode,
      isOpen: open,
      user,
      currentOrgId,
      currentOrg,
      availableRoles,
      rolesLoading,
      existingRoleAssignments,
      existingRolesLoading,
      onCreateUser: async (data) => {
        return inviteUserMutation.mutateAsync(data);
      },
      onUpdateUser: async (data) => {
        await updateUserMutation.mutateAsync(data);
      },
      onAssignRole: async (data) => {
        await assignRoleMutation.mutateAsync(data);
      },
      onRemoveRole: async (data) => {
        await removeRoleMutation.mutateAsync(data);
      },
      onSuccess: async () => {
        await utils.user.list.invalidate();
        if (user) {
          await utils.userOrg.getRolesForUser.invalidate({ userId: user.id });
        }
        toast.success(
          mode === "create"
            ? "User created successfully"
            : "User updated successfully"
        );
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message || "Failed to save user");
      },
      onClose,
    });

    const {
      formData,
      errors,
      isSubmitting,
      showPassword,
      generatedPassword,
      changePassword,
      currentStep,
      roleAssignments,
      newAssignment,
      filteredAvailableRoles,
      isCreateMode,
      setFormField,
      toggleShowPassword,
      generatePassword,
      handleNextStep,
      handlePreviousStep,
      setNewAssignment,
      handleAddRoleAssignment,
      handleRemoveRoleAssignment,
      handleSubmit,
    } = formLogic;

    const handleClose = () => {
      if (!isSubmitting) {
        onClose();
      }
    };

    const onFormSubmit = async () => {
      const result = await handleSubmit();
      if (!result.success && result.error) {
        toast.error(result.error);
      }
    };

    const onAddRole = () => {
      const result = handleAddRoleAssignment();
      if (!result.success && result.error) {
        toast.error(result.error);
      }
    };

    // Render step 1: Basic Information
    const renderStep1 = () => (
      <div className="space-y-4">
        {/* Name fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              placeholder="John"
              value={formData.firstName}
              onChange={(e) => setFormField("firstName", e.target.value)}
              disabled={isSubmitting}
              className={errors.firstName ? "border-destructive" : ""}
            />
            {errors.firstName && (
              <p className="text-sm text-destructive">{errors.firstName}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              placeholder="Doe"
              value={formData.lastName}
              onChange={(e) => setFormField("lastName", e.target.value)}
              disabled={isSubmitting}
              className={errors.lastName ? "border-destructive" : ""}
            />
            {errors.lastName && (
              <p className="text-sm text-destructive">{errors.lastName}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            placeholder="john.doe@example.com"
            value={formData.email}
            onChange={(e) => setFormField("email", e.target.value)}
            disabled={isSubmitting}
            className={errors.email ? "border-destructive" : ""}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={formData.phone}
            onChange={(e) => setFormField("phone", e.target.value)}
            disabled={isSubmitting}
            className={errors.phone ? "border-destructive" : ""}
          />
          {errors.phone && (
            <p className="text-sm text-destructive">{errors.phone}</p>
          )}
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">Username *</Label>
          <Input
            id="username"
            placeholder="johndoe"
            value={formData.username}
            onChange={(e) => setFormField("username", e.target.value)}
            disabled={isSubmitting}
            className={errors.username ? "border-destructive" : ""}
          />
          {errors.username && (
            <p className="text-sm text-destructive">{errors.username}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Used for login. Only letters, numbers, underscores, and hyphens.
          </p>
        </div>

        {/* Password */}
        {(isCreateMode || changePassword) && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">
                {isCreateMode ? "Password *" : "New Password *"}
              </Label>
              <Button
                type="button"
                variant="ghost"
                onClick={generatePassword}
                disabled={isSubmitting}
                className="h-auto p-1 text-xs"
              >
                <RefreshIcon className="mr-1" />
                Generate
              </Button>
            </div>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormField("password", e.target.value)}
                disabled={isSubmitting}
                className={cn(
                  "pr-10",
                  errors.password ? "border-destructive" : ""
                )}
              />
              <button
                type="button"
                onClick={toggleShowPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password}</p>
            )}
            {generatedPassword && (
              <p className="text-xs text-muted-foreground">
                Generated password has been set. Make sure to copy it before
                closing.
              </p>
            )}
          </div>
        )}

        {/* Active Status */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="isActive">Active Status</Label>
            <p className="text-sm text-muted-foreground">
              Active users can log in and access the system
            </p>
          </div>
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => setFormField("isActive", checked)}
            disabled={isSubmitting}
          />
        </div>
      </div>
    );

    // Render step 2: Role Assignments
    const renderStep2 = () => (
      <div className="space-y-4">
        {/* Current Role Assignments */}
        <div className="space-y-2">
          <Label>Current Role Assignments</Label>
          {roleAssignments.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No roles assigned yet. Add a role below.
            </div>
          ) : (
            <div className="space-y-2">
              {roleAssignments.map((assignment) => (
                <div
                  key={`${assignment.orgId}-${assignment.roleId}`}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-2">
                    <ShieldIcon className="text-muted-foreground" />
                    <span className="font-medium">{assignment.roleName}</span>
                    {assignment.isGlobalRole && (
                      <Badge variant="secondary" className="text-xs">
                        Global
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      handleRemoveRoleAssignment(
                        assignment.orgId,
                        assignment.roleId
                      )
                    }
                    disabled={isSubmitting}
                    className="h-8 w-8 p-0"
                  >
                    <XIcon className="text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Role Assignment */}
        <div className="space-y-2">
          <Label>Add Role</Label>
          <div className="flex gap-2">
            <div className="flex-1">
              <Select
                value={newAssignment.roleId}
                onValueChange={(value) =>
                  setNewAssignment({ ...newAssignment, roleId: value })
                }
                disabled={isSubmitting || rolesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {filteredAvailableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id.toString()}>
                      {role.name}
                      {role.isGlobalRole && " (Global)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={onAddRole}
              disabled={!newAssignment.roleId || isSubmitting}
            >
              <PlusIcon className="mr-1" />
              Add
            </Button>
          </div>
          {rolesLoading && (
            <p className="text-xs text-muted-foreground">Loading roles...</p>
          )}
        </div>

        {/* Review Summary */}
        <div className="rounded-lg border p-4 bg-muted/50 space-y-2">
          <h4 className="font-medium">Review User Details</h4>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Name:</span>{" "}
              {formData.firstName} {formData.lastName}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span>{" "}
              {formData.email}
            </p>
            <p>
              <span className="text-muted-foreground">Username:</span>{" "}
              {formData.username}
            </p>
            <p>
              <span className="text-muted-foreground">Status:</span>{" "}
              {formData.isActive ? "Active" : "Inactive"}
            </p>
            <p>
              <span className="text-muted-foreground">Roles:</span>{" "}
              {roleAssignments.length === 0
                ? "None"
                : roleAssignments.map((r) => r.roleName).join(", ")}
            </p>
          </div>
        </div>
      </div>
    );

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isCreateMode ? <UserPlusIcon /> : <UserIcon />}
              {isCreateMode ? "Create New User" : "Edit User"}
            </DialogTitle>
            <DialogDescription>
              {isCreateMode
                ? "Create a new user account and assign roles."
                : "Update user information and role assignments."}
            </DialogDescription>
          </DialogHeader>

          {/* Wizard Progress */}
          <div className="space-y-4 mb-4">
            <div className="flex items-center justify-between text-sm">
              <div
                className={cn(
                  "flex items-center gap-2",
                  currentStep === 1
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2",
                    currentStep === 1
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  )}
                >
                  1
                </div>
                <span>Basic Info</span>
              </div>
              <div className="flex-1 mx-4">
                <div className="h-[2px] bg-muted relative">
                  <div
                    className={cn(
                      "h-full bg-primary transition-all",
                      currentStep > 1 ? "w-full" : "w-0"
                    )}
                  />
                </div>
              </div>
              <div
                className={cn(
                  "flex items-center gap-2",
                  currentStep === 2
                    ? "text-primary font-medium"
                    : "text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2",
                    currentStep === 2
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-muted-foreground"
                  )}
                >
                  2
                </div>
                <span>Roles & Review</span>
              </div>
            </div>
          </div>

          {/* Form Content */}
          {currentStep === 1 ? renderStep1() : renderStep2()}

          <DialogFooter>
            {currentStep === 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleNextStep}
                  disabled={isSubmitting}
                >
                  Next
                  <ChevronRightIcon />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviousStep}
                  disabled={isSubmitting}
                >
                  <ChevronLeftIcon />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={onFormSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <LoaderIcon className="mr-2" />}
                  {isCreateMode ? "Create User" : "Save Changes"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };
}
