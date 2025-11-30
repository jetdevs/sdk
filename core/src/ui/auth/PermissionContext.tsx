/**
 * Permission Context
 *
 * Context for scoped permission checking in component trees.
 * Allows setting a base permission that child components can inherit.
 */

'use client';

import * as React from 'react';
import { createContext, useContext, type ReactNode } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface PermissionContextValue {
  /** Base permission slug (e.g., 'workflow', 'user') */
  basePermission: string | null;
  /** Full admin permission slug that grants all access */
  adminPermission?: string;
}

export interface PermissionProviderProps {
  /** Base permission for this context scope */
  basePermission: string;
  /** Full admin permission that grants all access */
  adminPermission?: string;
  children: ReactNode;
}

// =============================================================================
// CONTEXT
// =============================================================================

export const PermissionContext = createContext<PermissionContextValue>({
  basePermission: null,
  adminPermission: undefined,
});

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access the permission context
 *
 * @example
 * function MyComponent() {
 *   const { basePermission } = usePermissionContext();
 *   // basePermission might be 'workflow', so 'workflow:create' is the create permission
 * }
 */
export function usePermissionContext(): PermissionContextValue {
  const context = useContext(PermissionContext);

  if (context === undefined) {
    throw new Error('usePermissionContext must be used within a PermissionProvider');
  }

  return context;
}

// =============================================================================
// PROVIDER
// =============================================================================

/**
 * Provider for scoped permissions
 *
 * @example
 * // Wrap a feature area with its base permission
 * <PermissionProvider basePermission="workflow">
 *   <WorkflowEditor />
 * </PermissionProvider>
 *
 * // Child components can then use 'create', 'read', 'update', 'delete' actions
 * // which resolve to 'workflow:create', 'workflow:read', etc.
 */
export function PermissionProvider({
  basePermission,
  adminPermission,
  children,
}: PermissionProviderProps) {
  const value = React.useMemo(
    () => ({ basePermission, adminPermission }),
    [basePermission, adminPermission]
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}
