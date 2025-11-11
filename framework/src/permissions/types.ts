/**
 * Permission system types
 */

/**
 * Permission string format: resource:action
 * Examples: 'campaign:create', 'workflow:execute', 'admin:full_access'
 */
export type Permission = string;

/**
 * Context required for permission checks
 * This is extracted from tRPC context
 */
export interface PermissionContext {
  userId: number;
  orgId: number;
  permissions: Permission[];
}

/**
 * Handler function type with permission check
 */
export type PermissionHandler<TInput = unknown, TOutput = unknown> = (
  ctx: PermissionContext,
  input: TInput
) => Promise<TOutput>;

/**
 * Options for permission checking
 */
export interface PermissionCheckOptions {
  /**
   * Throw error if permission is denied
   * @default true
   */
  throwOnDenied?: boolean;

  /**
   * Custom error message
   */
  errorMessage?: string;
}
