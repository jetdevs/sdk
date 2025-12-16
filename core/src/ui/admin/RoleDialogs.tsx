"use client";

/**
 * Role Dialog Factories
 *
 * Provides factory functions for creating role management dialogs.
 * Apps create dialog components using factory functions that accept their tRPC client and UI components.
 *
 * @module @jetdevs/core/ui/admin
 *
 * @example
 * ```typescript
 * // Create delete role dialog
 * import { createDeleteRoleDialogFactory } from '@jetdevs/core/ui/admin';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const DeleteRoleDialog = createDeleteRoleDialogFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Role data type - matches rbac/types.ts RoleWithStats
 * userCount and permissionCount are optional for backward compatibility
 */
export interface RoleWithStats {
  id: number;
  name: string;
  description?: string | null;
  isSystemRole: boolean;
  isActive: boolean;
  userCount?: number;
  permissionCount?: number;
}

/**
 * Toast interface for notifications
 */
export interface ToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

// =============================================================================
// DELETE ROLE DIALOG
// =============================================================================

/**
 * UI components required for DeleteRoleDialog
 */
export interface DeleteRoleDialogUIComponents {
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  AlertDialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  AlertDialogDescription: React.ComponentType<{
    asChild?: boolean;
    children: React.ReactNode;
  }>;
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogCancel: React.ComponentType<{
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  AlertDialogAction: React.ComponentType<{
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  toast: ToastInterface;
}

/**
 * API interface for DeleteRoleDialog
 */
export interface DeleteRoleDialogApi {
  role: {
    delete: {
      useMutation: () => {
        mutateAsync: (id: number) => Promise<unknown>;
      };
    };
  };
  useUtils: () => {
    role: {
      getAllWithStats: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory config for DeleteRoleDialog
 */
export interface DeleteRoleDialogFactoryConfig {
  api: DeleteRoleDialogApi;
  ui: DeleteRoleDialogUIComponents;
}

/**
 * Props for DeleteRoleDialog component
 */
export interface DeleteRoleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  role: RoleWithStats | null;
}

// Icons
const AlertTriangleIcon = () => (
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
    className="text-destructive"
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const LockIcon = ({ className = "" }: { className?: string }) => (
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
    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const UsersIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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

/**
 * Create a DeleteRoleDialog component
 *
 * @param config - Factory configuration with API and UI components
 * @returns DeleteRoleDialog component
 */
export function createDeleteRoleDialogFactory(
  config: DeleteRoleDialogFactoryConfig
) {
  const { api, ui } = config;
  const {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    Badge,
    toast,
  } = ui;

  return function DeleteRoleDialog({
    open,
    onClose,
    onSuccess,
    role,
  }: DeleteRoleDialogProps) {
    const [isDeleting, setIsDeleting] = React.useState(false);

    const deleteRoleMutation = api.role.delete.useMutation();
    const utils = api.useUtils();

    const handleClose = () => {
      if (!isDeleting) {
        onClose();
      }
    };

    const handleDelete = async () => {
      if (!role) return;

      setIsDeleting(true);

      try {
        await deleteRoleMutation.mutateAsync(role.id);
        await utils.role.getAllWithStats.invalidate();

        toast.success(`Role "${role.name}" has been deleted successfully`);

        onSuccess?.();
        onClose();
      } catch (error: unknown) {
        console.error("Error deleting role:", error);

        const errorMessage = error instanceof Error ? error.message : "";
        if (
          errorMessage.includes("FORBIDDEN") ||
          errorMessage.includes("system")
        ) {
          toast.error("Cannot delete system roles");
        } else if (errorMessage.includes("not found")) {
          toast.error("Role not found. It may have already been deleted.");
        } else if (
          errorMessage.includes("constraint") ||
          errorMessage.includes("foreign key")
        ) {
          toast.error(
            "Cannot delete role. Users are still assigned to this role."
          );
        } else {
          toast.error("Failed to delete role. Please try again.");
        }
      } finally {
        setIsDeleting(false);
      }
    };

    if (!role) return null;

    const isSystemRole = role.isSystemRole;
    const userCount = role.userCount ?? 0;
    const permissionCount = role.permissionCount ?? 0;
    const hasUsers = userCount > 0;

    return (
      <AlertDialog open={open} onOpenChange={handleClose}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon />
              Delete Role
              {isSystemRole && (
                <Badge variant="secondary" className="ml-2">
                  <LockIcon className="mr-1" />
                  System Role
                </Badge>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Are you sure you want to delete the role{" "}
                  <strong>&quot;{role.name}&quot;</strong>?
                  {isSystemRole
                    ? " System roles cannot be deleted as they are required for system functionality."
                    : " This action cannot be undone."}
                </p>

                {!isSystemRole && (
                  <>
                    {/* Role Impact Information */}
                    <div className="rounded-lg border p-4 bg-muted/50">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <AlertTriangleIcon />
                        Impact Assessment
                      </h4>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <UsersIcon className="text-muted-foreground" />
                            Users affected:
                          </span>
                          <Badge variant={hasUsers ? "destructive" : "secondary"}>
                            {userCount}{" "}
                            {userCount === 1 ? "user" : "users"}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <ShieldIcon className="text-muted-foreground" />
                            Permissions:
                          </span>
                          <Badge variant="outline">
                            {permissionCount}{" "}
                            {permissionCount === 1
                              ? "permission"
                              : "permissions"}
                          </Badge>
                        </div>
                      </div>

                      {hasUsers && (
                        <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                          <p className="text-sm text-destructive font-medium">
                            Warning: {userCount}{" "}
                            {userCount === 1 ? "user is" : "users are"}{" "}
                            currently assigned to this role.
                          </p>
                          <p className="text-xs text-destructive/80 mt-1">
                            These users will lose all permissions associated with
                            this role.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Deletion Details */}
                    <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-md">
                      <p>
                        <strong>What happens when you delete this role:</strong>
                      </p>
                      <ul className="mt-1 space-y-1 list-disc list-inside">
                        <li>The role will be marked as inactive (soft delete)</li>
                        <li>Users will lose access to permissions from this role</li>
                        <li>Role assignments will be removed</li>
                        <li>Historical data will be preserved</li>
                      </ul>
                    </div>
                  </>
                )}

                {isSystemRole && (
                  <div className="rounded-lg border p-4 bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <LockIcon className="text-muted-foreground" />
                      <span className="font-medium">System Role Protection</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      This role is protected because it&apos;s essential for
                      system functionality. System roles cannot be deleted to
                      maintain platform integrity.
                    </p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting || isSystemRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <LoaderIcon className="mr-2" />}
              {isSystemRole ? "Cannot Delete" : "Delete Role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
}

// =============================================================================
// BULK DELETE DIALOG
// =============================================================================

/**
 * UI components required for BulkDeleteDialog
 */
export interface BulkDeleteDialogUIComponents {
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  AlertDialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  AlertDialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  AlertDialogCancel: React.ComponentType<{
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  AlertDialogAction: React.ComponentType<{
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  Separator: React.ComponentType<{ className?: string }>;
}

/**
 * Factory config for BulkDeleteDialog
 */
export interface BulkDeleteDialogFactoryConfig {
  ui: BulkDeleteDialogUIComponents;
}

/**
 * Props for BulkDeleteDialog component
 */
export interface BulkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  roles: RoleWithStats[];
  isLoading?: boolean;
}

const TrashIcon = ({ className = "" }: { className?: string }) => (
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
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

/**
 * Create a BulkDeleteDialog component
 *
 * @param config - Factory configuration with UI components
 * @returns BulkDeleteDialog component
 */
export function createBulkDeleteDialogFactory(
  config: BulkDeleteDialogFactoryConfig
) {
  const { ui } = config;
  const {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    Badge,
    Separator,
  } = ui;

  return function BulkDeleteDialog({
    open,
    onClose,
    onConfirm,
    roles,
    isLoading = false,
  }: BulkDeleteDialogProps) {
    const systemRoles = roles.filter((role) => role.isSystemRole);
    const customRoles = roles.filter((role) => !role.isSystemRole);
    const totalUsers = roles.reduce((sum, role) => sum + (role.userCount ?? 0), 0);
    const totalPermissions = roles.reduce(
      (sum, role) => sum + (role.permissionCount ?? 0),
      0
    );

    return (
      <AlertDialog open={open} onOpenChange={onClose}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <TrashIcon className="text-destructive" />
              Confirm Bulk Delete
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete {roles.length} role(s). This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            {/* System Roles Warning */}
            {systemRoles.length > 0 && (
              <div className="p-4 border border-destructive/20 bg-destructive/5 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangleIcon />
                  <span className="font-medium text-destructive">
                    System Roles Cannot Be Deleted
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  The following {systemRoles.length} system role(s) will be
                  skipped:
                </p>
                <div className="flex flex-wrap gap-1">
                  {systemRoles.map((role) => (
                    <Badge key={role.id} variant="secondary" className="text-xs">
                      {role.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Roles to Delete */}
            {customRoles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <TrashIcon className="text-destructive h-4 w-4" />
                  <span className="font-medium">
                    Roles to Delete ({customRoles.length})
                  </span>
                </div>

                <div className="max-h-32 overflow-y-auto space-y-2">
                  {customRoles.map((role) => (
                    <div
                      key={role.id}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <ShieldIcon className="text-muted-foreground" />
                        <span className="font-medium">{role.name}</span>
                        {role.description && (
                          <span className="text-xs text-muted-foreground">
                            - {role.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <UsersIcon />
                          {role.userCount ?? 0}
                        </div>
                        <div className="flex items-center gap-1">
                          <ShieldIcon />
                          {role.permissionCount ?? 0}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Impact Summary */}
            {customRoles.length > 0 && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">
                      {totalUsers}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Users Affected
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-destructive">
                      {totalPermissions}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Permissions Removed
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* No Deletable Roles */}
            {customRoles.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <AlertTriangleIcon />
                <p>
                  No roles can be deleted. All selected roles are system roles.
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirm}
              disabled={isLoading || customRoles.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoading ? "Deleting..." : `Delete ${customRoles.length} Role(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
}

// =============================================================================
// CREATE ROLE DIALOG
// =============================================================================

/**
 * UI components required for CreateRoleDialog
 */
export interface CreateRoleDialogUIComponents {
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  DialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  DialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  DialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  DialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  DialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  Input: React.ComponentType<{
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    className?: string;
  }>;
  Textarea: React.ComponentType<{
    id?: string;
    placeholder?: string;
    rows?: number;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
    className?: string;
  }>;
  Label: React.ComponentType<{
    htmlFor?: string;
    children: React.ReactNode;
  }>;
  Switch: React.ComponentType<{
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }>;
  toast: ToastInterface;
}

/**
 * API interface for CreateRoleDialog
 */
export interface CreateRoleDialogApi {
  role: {
    create: {
      useMutation: () => {
        mutateAsync: (data: {
          name: string;
          description?: string;
        }) => Promise<{ name?: string } | null>;
      };
    };
  };
  useUtils: () => {
    role: {
      getAllWithStats: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory config for CreateRoleDialog
 */
export interface CreateRoleDialogFactoryConfig {
  api: CreateRoleDialogApi;
  ui: CreateRoleDialogUIComponents;
}

/**
 * Props for CreateRoleDialog component
 */
export interface CreateRoleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (newRole?: unknown) => void;
}

const ShieldIconLarge = () => (
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
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
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

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * Create a CreateRoleDialog component
 *
 * @param config - Factory configuration with API and UI components
 * @returns CreateRoleDialog component
 */
export function createCreateRoleDialogFactory(
  config: CreateRoleDialogFactoryConfig
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
    Textarea,
    Label,
    Switch,
    toast,
  } = ui;

  return function CreateRoleDialog({
    open,
    onClose,
    onSuccess,
  }: CreateRoleDialogProps) {
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [currentStep, setCurrentStep] = React.useState(1);
    const [formData, setFormData] = React.useState({
      name: "",
      description: "",
      isActive: true,
    });
    const [errors, setErrors] = React.useState<{ name?: string; description?: string }>({});

    const createRoleMutation = api.role.create.useMutation();
    const utils = api.useUtils();

    const resetForm = () => {
      setFormData({ name: "", description: "", isActive: true });
      setErrors({});
      setCurrentStep(1);
    };

    const handleClose = () => {
      if (!isSubmitting) {
        resetForm();
        onClose();
      }
    };

    const validateStep1 = () => {
      const newErrors: { name?: string; description?: string } = {};

      if (!formData.name || formData.name.trim().length === 0) {
        newErrors.name = "Role name is required";
      } else if (formData.name.length < 2) {
        newErrors.name = "Role name must be at least 2 characters";
      } else if (formData.name.length > 100) {
        newErrors.name = "Role name must be less than 100 characters";
      } else if (!/^[a-zA-Z0-9\s\-_]+$/.test(formData.name)) {
        newErrors.name = "Role name can only contain letters, numbers, spaces, hyphens, and underscores";
      }

      if (formData.description && formData.description.length > 500) {
        newErrors.description = "Description must be less than 500 characters";
      }

      setErrors(newErrors);
      return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
      if (validateStep1()) {
        setCurrentStep(2);
      }
    };

    const handleBack = () => {
      setCurrentStep(1);
    };

    const handleSubmit = async () => {
      if (currentStep !== 2) return;

      setIsSubmitting(true);

      try {
        const newRole = await createRoleMutation.mutateAsync({
          name: formData.name,
          description: formData.description || undefined,
        });

        await utils.role.getAllWithStats.invalidate();

        toast.success(
          `Role "${newRole?.name || "New role"}" created successfully`
        );

        resetForm();
        onSuccess?.(newRole);
        onClose();
      } catch (error: unknown) {
        console.error("Error creating role:", error);

        const errorMessage = error instanceof Error ? error.message : "";
        if (
          errorMessage.includes("duplicate") ||
          errorMessage.includes("unique")
        ) {
          toast.error("A role with this name already exists");
        } else {
          toast.error("Failed to create role. Please try again.");
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldIconLarge />
              Create New Role
            </DialogTitle>
            <DialogDescription>
              Create a new role to organize user permissions and access levels.
            </DialogDescription>
          </DialogHeader>

          {/* Wizard Progress */}
          <div className="space-y-4 mb-6">
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
                <span>Basic Information</span>
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
                <span>Review & Create</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {currentStep === 1 && (
              <>
                {/* Role Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Role Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Content Manager, Support Agent"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Describe the role's purpose and responsibilities..."
                    rows={3}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    disabled={isSubmitting}
                  />
                  {errors.description && (
                    <p className="text-sm text-destructive">
                      {errors.description}
                    </p>
                  )}
                </div>

                {/* Active Status */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isActive">Active Status</Label>
                    <p className="text-sm text-muted-foreground">
                      Active roles can be assigned to users
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData((prev) => ({ ...prev, isActive: checked }))
                    }
                    disabled={isSubmitting}
                  />
                </div>
              </>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="font-medium">Review Role Details</h4>
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="text-muted-foreground">Name:</span>{" "}
                      {formData.name}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Description:</span>{" "}
                      {formData.description || "No description provided"}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Status:</span>{" "}
                      {formData.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <p className="font-medium mb-2">Next Steps After Creation:</p>
                  <ul className="space-y-1 ml-4 list-disc">
                    <li>Assign permissions to define what this role can do</li>
                    <li>Add users to this role to grant them access</li>
                    <li>Configure role-specific settings as needed</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

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
                <Button type="button" onClick={handleNext} disabled={isSubmitting}>
                  Next
                  <ChevronRightIcon />
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleBack}
                  disabled={isSubmitting}
                >
                  <ChevronLeftIcon />
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <LoaderIcon className="mr-2" />}
                  Create Role
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };
}
