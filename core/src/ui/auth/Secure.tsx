/**
 * Secure Component Factory
 *
 * Factory to create a compound component system for declarative permission checks.
 * Returns Secure.Container, Secure.Button, Secure.Form, etc.
 */

'use client';

import * as React from 'react';
import { createContext, useContext, type ReactNode, useEffect } from 'react';
import { PermissionProvider, usePermissionContext } from './PermissionContext';

// =============================================================================
// TYPES
// =============================================================================

export type SecureAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | string;

export interface SecureConfig {
  /**
   * Function to check if user has a permission
   */
  hasPermission: (permission: string) => boolean | null;
  /**
   * Whether the permission system is loading (null from hasPermission indicates loading)
   */
  isLoading?: boolean;
  /**
   * Redirect function for unauthorized access
   */
  redirect?: (path: string) => void;
  /**
   * Skeleton component factory
   */
  Skeleton?: React.ComponentType<{ type?: string; className?: string }>;
  /**
   * Button component
   */
  Button?: React.ComponentType<any>;
  /**
   * Input component
   */
  Input?: React.ComponentType<any>;
  /**
   * DropdownMenuItem component
   */
  DropdownMenuItem?: React.ComponentType<any>;
}

// =============================================================================
// FORM DISABLED CONTEXT
// =============================================================================

interface FormDisabledContextValue {
  disabled: boolean;
}

const FormDisabledContext = createContext<FormDisabledContextValue>({
  disabled: false,
});

export function useFormDisabledContext() {
  return useContext(FormDisabledContext);
}

// =============================================================================
// COMPONENT INTERFACES
// =============================================================================

export interface SecureContainerProps {
  /** Base permission module (e.g., 'workflow') */
  basePermission?: string;
  /** Specific action to check */
  action?: SecureAction;
  /** Full permission slug (overrides basePermission + action) */
  permission?: string;
  children: ReactNode;
  /** Fallback content when unauthorized */
  fallback?: ReactNode;
  /** Skeleton type to show while loading */
  skeleton?: string;
  className?: string;
  /** Where to redirect on unauthorized (if not showing fallback) */
  redirectTo?: string;
  /** Show fallback instead of redirecting */
  showFallback?: boolean;
}

export interface SecureButtonProps {
  /** Action to check (combined with base permission from context) */
  action: SecureAction;
  /** Full permission slug (overrides context + action) */
  permission?: string;
  children: ReactNode;
  [key: string]: unknown;
}

export interface SecureFormProps extends React.FormHTMLAttributes<HTMLFormElement> {
  /** Permission required for form editing */
  permission?: string;
  children: ReactNode;
}

export interface SecureInputProps {
  disabled?: boolean;
  [key: string]: unknown;
}

export interface SecureDropdownMenuItemProps {
  /** Action to check */
  action?: SecureAction;
  /** Full permission slug */
  permission?: string;
  children: ReactNode;
  [key: string]: unknown;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a Secure compound component
 *
 * @example
 * // Create the Secure compound component with your dependencies
 * const Secure = createSecure({
 *   hasPermission: usePermission, // from your auth hooks
 *   redirect: useRouter().push,
 *   Skeleton: MySkeleton,
 *   Button: MyButton,
 *   Input: MyInput,
 * });
 *
 * // Usage:
 * <Secure.Container basePermission="workflow" action="read">
 *   <WorkflowList />
 *   <Secure.Button action="create">Create Workflow</Secure.Button>
 * </Secure.Container>
 */
export function createSecure(config: SecureConfig) {
  const {
    hasPermission: checkPermission,
    redirect,
    Skeleton: DefaultSkeleton,
    Button: DefaultButton,
    Input: DefaultInput,
    DropdownMenuItem: DefaultDropdownMenuItem,
  } = config;

  // ==========================================================================
  // SECURE CONTAINER
  // ==========================================================================

  function SecureContainer({
    basePermission,
    action,
    permission,
    children,
    fallback = null,
    skeleton = 'Page',
    className,
    redirectTo = '/',
    showFallback = false,
  }: SecureContainerProps) {
    const { basePermission: inheritedBasePermission } = usePermissionContext();

    // Build required permission
    const effectiveBasePermission = basePermission || inheritedBasePermission;
    const requiredPermission =
      permission ||
      (effectiveBasePermission && action
        ? `${effectiveBasePermission}:${action}`
        : '') ||
      (effectiveBasePermission ? `${effectiveBasePermission}:read` : '');

    const hasAccess = checkPermission(requiredPermission);

    // Handle redirect on unauthorized
    useEffect(() => {
      if (hasAccess === false && !showFallback && redirect) {
        redirect(redirectTo);
      }
    }, [hasAccess, showFallback, redirectTo]);

    // Loading state
    if (hasAccess === null || hasAccess === undefined) {
      if (DefaultSkeleton) {
        return <DefaultSkeleton type={skeleton} className={className} />;
      }
      return <div className={className}>Loading...</div>;
    }

    // No access
    if (!hasAccess) {
      if (showFallback) {
        return <>{fallback}</>;
      }
      // Return skeleton while redirecting
      if (DefaultSkeleton) {
        return <DefaultSkeleton type={skeleton} className={className} />;
      }
      return null;
    }

    // Has access - wrap in permission provider
    return (
      <PermissionProvider basePermission={effectiveBasePermission || ''}>
        {children}
      </PermissionProvider>
    );
  }

  // ==========================================================================
  // SECURE BUTTON
  // ==========================================================================

  function SecureButton({
    action,
    permission,
    children,
    ...props
  }: SecureButtonProps) {
    const { basePermission } = usePermissionContext();

    const requiredPermission =
      permission || (basePermission ? `${basePermission}:${action}` : '');

    const hasAccess = checkPermission(requiredPermission);

    // Loading or no access - hide button
    if (hasAccess !== true) {
      return null;
    }

    if (DefaultButton) {
      return <DefaultButton {...props}>{children}</DefaultButton>;
    }

    return <button {...(props as any)}>{children}</button>;
  }

  // ==========================================================================
  // SECURE FORM
  // ==========================================================================

  function SecureForm({ permission, children, ...props }: SecureFormProps) {
    const { basePermission } = usePermissionContext();

    const requiredPermission =
      permission || (basePermission ? `${basePermission}:update` : '');

    const hasAccess = checkPermission(requiredPermission);

    return (
      <FormDisabledContext.Provider value={{ disabled: hasAccess !== true }}>
        <form {...props}>{children}</form>
      </FormDisabledContext.Provider>
    );
  }

  // ==========================================================================
  // SECURE INPUT
  // ==========================================================================

  function SecureInput({ disabled, ...props }: SecureInputProps) {
    const { disabled: formDisabled } = useFormDisabledContext();

    if (DefaultInput) {
      return <DefaultInput disabled={disabled || formDisabled} {...props} />;
    }

    return <input disabled={disabled || formDisabled} {...(props as any)} />;
  }

  // ==========================================================================
  // SECURE DROPDOWN MENU ITEM
  // ==========================================================================

  function SecureDropdownMenuItemComponent({
    action,
    permission,
    children,
    ...props
  }: SecureDropdownMenuItemProps) {
    const { basePermission } = usePermissionContext();

    // If no action or permission, always show (neutral item)
    if (!action && !permission) {
      if (DefaultDropdownMenuItem) {
        return <DefaultDropdownMenuItem {...props}>{children}</DefaultDropdownMenuItem>;
      }
      return <div {...(props as any)}>{children}</div>;
    }

    const requiredPermission =
      permission ||
      (basePermission && action ? `${basePermission}:${action}` : '');

    const hasAccess = checkPermission(requiredPermission);

    if (hasAccess !== true) {
      return null;
    }

    if (DefaultDropdownMenuItem) {
      return <DefaultDropdownMenuItem {...props}>{children}</DefaultDropdownMenuItem>;
    }

    return <div {...(props as any)}>{children}</div>;
  }

  // ==========================================================================
  // RETURN COMPOUND COMPONENT
  // ==========================================================================

  return {
    Container: SecureContainer,
    Button: SecureButton,
    Form: SecureForm,
    Input: SecureInput,
    DropdownMenuItem: SecureDropdownMenuItemComponent,
  };
}
