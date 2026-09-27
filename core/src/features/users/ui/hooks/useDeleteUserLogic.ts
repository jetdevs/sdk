/**
 * Delete User Logic Hook
 *
 * Headless hook that encapsulates all business logic for user deletion.
 * Handles confirmation state, impact assessment, and deletion execution.
 *
 * @module @jetdevs/core/features/users/ui/hooks/useDeleteUserLogic
 */

"use client";

import { useState, useCallback, useMemo } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Role assignment data for impact assessment
 */
export interface UserRoleImpact {
  roleId: number;
  roleName: string;
  orgId: number;
  orgName: string;
  isActive: boolean;
}

/**
 * User data for deletion (minimal fields needed)
 */
export interface DeleteUserData {
  id: number;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  isActive: boolean;
  createdAt: Date | string;
  roleCount?: number;
  roles?: UserRoleImpact[];
}

/**
 * Configuration for the useDeleteUserLogic hook
 */
export interface UseDeleteUserLogicConfig {
  /** User to delete */
  user: DeleteUserData | null;

  /** Callback to execute deletion */
  onDelete: (userId: number) => Promise<void>;

  /** Callback when deletion succeeds */
  onSuccess?: () => void;

  /** Callback when deletion fails */
  onError?: (error: Error) => void;

  /** Callback to close dialog */
  onClose: () => void;
}

/**
 * Return type for useDeleteUserLogic hook
 */
export interface DeleteUserLogicReturn {
  // State
  isDeleting: boolean;
  canDelete: boolean;

  // Impact assessment
  hasActiveRoles: boolean;
  activeRoleCount: number;
  activeOrganizationCount: number;
  rolesPreview: UserRoleImpact[];
  remainingRolesCount: number;

  // User display data
  userName: string;
  userEmail: string;
  userStatus: "active" | "inactive";
  userCreatedAt: string;

  // Actions
  handleDelete: () => Promise<{ success: boolean; error?: string }>;
  handleClose: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const MAX_ROLES_PREVIEW = 3;

// =============================================================================
// HOOK
// =============================================================================

/**
 * Headless hook for user deletion logic
 *
 * @example
 * ```tsx
 * const deleteLogic = useDeleteUserLogic({
 *   user: selectedUser,
 *   onDelete: async (userId) => api.user.delete.mutateAsync(userId),
 *   onSuccess: () => {
 *     toast.success('User deleted');
 *     refetchUsers();
 *   },
 *   onClose: () => setDeleteDialogOpen(false),
 * });
 *
 * // Use in UI
 * <Button onClick={deleteLogic.handleDelete} disabled={deleteLogic.isDeleting}>
 *   {deleteLogic.isDeleting ? 'Deleting...' : 'Delete User'}
 * </Button>
 * ```
 */
export function useDeleteUserLogic(
  config: UseDeleteUserLogicConfig
): DeleteUserLogicReturn {
  const { user, onDelete, onSuccess, onError, onClose } = config;

  // ---------------------------------------------------------------------------
  // STATE
  // ---------------------------------------------------------------------------

  const [isDeleting, setIsDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // COMPUTED VALUES
  // ---------------------------------------------------------------------------

  const roles = useMemo(() => user?.roles ?? [], [user?.roles]);

  const activeRoles = useMemo(
    () => roles.filter((role) => role.isActive),
    [roles]
  );

  const hasActiveRoles = activeRoles.length > 0;

  const activeRoleCount = user?.roleCount ?? activeRoles.length;

  const activeOrganizationCount = useMemo(() => {
    const uniqueOrgs = new Set(activeRoles.map((role) => role.orgId));
    return uniqueOrgs.size;
  }, [activeRoles]);

  const rolesPreview = useMemo(
    () => activeRoles.slice(0, MAX_ROLES_PREVIEW),
    [activeRoles]
  );

  const remainingRolesCount = useMemo(
    () => Math.max(0, activeRoles.length - MAX_ROLES_PREVIEW),
    [activeRoles]
  );

  const userName = useMemo(() => {
    if (!user) return "";
    if (user.name) return user.name;
    if (user.firstName || user.lastName) {
      return `${user.firstName || ""} ${user.lastName || ""}`.trim();
    }
    return user.email;
  }, [user]);

  const userEmail = user?.email ?? "";

  const userStatus = user?.isActive ? "active" : "inactive";

  const userCreatedAt = useMemo(() => {
    if (!user?.createdAt) return "";
    const date =
      typeof user.createdAt === "string"
        ? new Date(user.createdAt)
        : user.createdAt;
    return date.toLocaleDateString();
  }, [user?.createdAt]);

  const canDelete = user !== null;

  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------

  const handleClose = useCallback(() => {
    if (!isDeleting) {
      onClose();
    }
  }, [isDeleting, onClose]);

  const handleDelete = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!user) {
      return { success: false, error: "No user selected" };
    }

    setIsDeleting(true);

    try {
      await onDelete(user.id);
      onSuccess?.();
      onClose();
      return { success: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      onError?.(error instanceof Error ? error : new Error(errorMessage));

      // Provide user-friendly error messages
      if (errorMessage.includes("not found")) {
        return {
          success: false,
          error: "User not found. It may have already been deleted.",
        };
      }
      if (errorMessage.includes("cannot delete")) {
        return {
          success: false,
          error: "Cannot delete this user. They may have active assignments.",
        };
      }
      if (
        errorMessage.includes("constraint") ||
        errorMessage.includes("foreign key")
      ) {
        return {
          success: false,
          error:
            "Cannot delete user due to existing references. Please remove all assignments first.",
        };
      }

      return { success: false, error: "Failed to delete user. Please try again." };
    } finally {
      setIsDeleting(false);
    }
  }, [user, onDelete, onSuccess, onError, onClose]);

  // ---------------------------------------------------------------------------
  // RETURN
  // ---------------------------------------------------------------------------

  return {
    // State
    isDeleting,
    canDelete,

    // Impact assessment
    hasActiveRoles,
    activeRoleCount,
    activeOrganizationCount,
    rolesPreview,
    remainingRolesCount,

    // User display data
    userName,
    userEmail,
    userStatus,
    userCreatedAt,

    // Actions
    handleDelete,
    handleClose,
  };
}
