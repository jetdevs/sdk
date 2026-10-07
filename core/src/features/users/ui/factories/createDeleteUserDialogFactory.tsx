"use client";

/**
 * Delete User Dialog Factory
 *
 * Factory function for creating user deletion dialogs.
 * Apps create dialog components using factory functions that accept their tRPC client and UI components.
 *
 * @module @jetdevs/core/features/users/ui/factories/createDeleteUserDialogFactory
 *
 * @example
 * ```typescript
 * // Create delete user dialog
 * import { createDeleteUserDialogFactory } from '@jetdevs/core/features/users/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const DeleteUserDialog = createDeleteUserDialogFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 *
 * // Usage
 * <DeleteUserDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   user={selectedUser}
 * />
 * ```
 */

import * as React from "react";
import { useCoreLabels } from "../../../../ui/labels";
import {
  useDeleteUserLogic,
  type DeleteUserData,
  type UserRoleImpact,
} from "../hooks/useDeleteUserLogic";
import type { SimpleToastInterface } from "../../../shared/types/toast";

// =============================================================================
// TYPES
// =============================================================================

/**
 * UI components required for DeleteUserDialog
 */
export interface DeleteUserDialogUIComponents {
  /** Alert dialog root component */
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  /** Alert dialog content wrapper */
  AlertDialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Alert dialog header section */
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Alert dialog title */
  AlertDialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Alert dialog description */
  AlertDialogDescription: React.ComponentType<{
    asChild?: boolean;
    children: React.ReactNode;
  }>;
  /** Alert dialog footer section */
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  /** Alert dialog cancel button */
  AlertDialogCancel: React.ComponentType<{
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  /** Alert dialog action button */
  AlertDialogAction: React.ComponentType<{
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Badge component */
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  /** Toast notifications */
  toast: SimpleToastInterface;
}

/**
 * API interface for DeleteUserDialog
 */
export interface DeleteUserDialogApi {
  user: {
    delete: {
      useMutation: () => {
        mutateAsync: (userId: number) => Promise<unknown>;
      };
    };
  };
  useUtils: () => {
    user: {
      getAllWithStats?: {
        invalidate: () => Promise<void>;
      };
      list?: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory configuration for DeleteUserDialog
 */
export interface DeleteUserDialogFactoryConfig {
  /** API client (tRPC-compatible) */
  api: DeleteUserDialogApi;
  /** UI components */
  ui: DeleteUserDialogUIComponents;
}

/**
 * Props for DeleteUserDialog component
 */
export interface DeleteUserDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** Callback on successful deletion */
  onSuccess?: () => void;
  /** User to delete */
  user: DeleteUserData | null;
}

// =============================================================================
// ICONS
// =============================================================================

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

const UserIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const ShieldIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
);

const BuildingIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
    <path d="M6 12H4a2 2 0 0 0-2 2v8h4" />
    <path d="M18 12h2a2 2 0 0 1 2 2v8h-4" />
    <path d="M10 6h4" />
    <path d="M10 10h4" />
    <path d="M10 14h4" />
    <path d="M10 18h4" />
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

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a DeleteUserDialog component
 *
 * Factory function that creates a user deletion dialog component
 * with injected API client and UI components.
 *
 * @param config - Factory configuration with API and UI components
 * @returns DeleteUserDialog component
 *
 * @example
 * ```typescript
 * const DeleteUserDialog = createDeleteUserDialogFactory({
 *   api,
 *   ui: { AlertDialog, AlertDialogContent, ..., toast },
 * });
 *
 * // In component
 * <DeleteUserDialog
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   user={selectedUser}
 * />
 * ```
 */
export function createDeleteUserDialogFactory(
  config: DeleteUserDialogFactoryConfig
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

  return function DeleteUserDialog({
    open,
    onClose,
    onSuccess,
    user,
  }: DeleteUserDialogProps) {
    const labels = useCoreLabels();
    const t = labels.deleteUser;
    // API mutation
    const deleteUserMutation = api.user.delete.useMutation();
    const utils = api.useUtils();

    // Use the headless hook for all deletion logic
    const logic = useDeleteUserLogic({
      user,
      onDelete: async (userId) => {
        await deleteUserMutation.mutateAsync(userId);
      },
      onSuccess: async () => {
        // Invalidate queries - support both naming conventions
        if (utils.user.getAllWithStats) {
          await utils.user.getAllWithStats.invalidate();
        }
        if (utils.user.list) {
          await utils.user.list.invalidate();
        }
        toast.success(t.deleted(logic.userName));
        onSuccess?.();
      },
      onError: (error) => {
        toast.error(error.message);
      },
      onClose,
    });

    if (!user) return null;

    return (
      <AlertDialog open={open} onOpenChange={logic.handleClose}>
        <AlertDialogContent className="sm:max-w-[500px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon />
              {t.title}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>{t.description}</p>

                {/* User Information */}
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    {t.userDetails}
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.name}</span>
                      <span className="font-medium">{logic.userName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.email}</span>
                      <span className="font-medium">{logic.userEmail}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t.status}</span>
                      <Badge
                        variant={
                          logic.userStatus === "active" ? "default" : "secondary"
                        }
                      >
                        {logic.userStatus === "active" ? labels.common.active : labels.common.inactive}
                      </Badge>
                    </div>
                    {logic.userCreatedAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t.created}</span>
                        <span className="font-medium">{logic.userCreatedAt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Role Assignments Warning */}
                {logic.hasActiveRoles && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 p-4">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2 text-orange-800">
                      <ShieldIcon className="h-4 w-4" />
                      {t.activeRoleAssignments}
                    </h4>
                    <p className="text-sm text-orange-700 mb-3">
                      {t.roleImpact(logic.activeRoleCount, logic.activeOrganizationCount)}
                    </p>
                    <div className="space-y-2">
                      {logic.rolesPreview.map((role, index) => (
                        <div
                          key={`${role.orgId}-${role.roleId}-${index}`}
                          className="flex items-center gap-2 text-xs"
                        >
                          <BuildingIcon className="text-orange-600" />
                          <span className="font-medium">{role.orgName}</span>
                          <span className="text-orange-600">→</span>
                          <span>{role.roleName}</span>
                        </div>
                      ))}
                      {logic.remainingRolesCount > 0 && (
                        <p className="text-xs text-orange-600">
                          {t.moreRoles(logic.remainingRolesCount)}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Confirmation Warning */}
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm text-red-800">
                    <strong>{t.warningLabel}</strong> {t.warning}
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={logic.isDeleting}>
              {labels.common.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                logic.handleDelete();
              }}
              disabled={logic.isDeleting || !logic.canDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {logic.isDeleting && <LoaderIcon className="mr-2" />}
              {logic.isDeleting ? labels.common.deleting : t.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
}

// Re-export types for consumers
export type { DeleteUserData, UserRoleImpact };
