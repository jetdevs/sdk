/**
 * Layout Components - Factory Pattern
 *
 * This module provides factory functions to create layout components
 * with injected UI dependencies. Apps provide their own Shadcn or custom
 * UI components to the factories.
 *
 * @example
 * ```typescript
 * // In your app's components/layout/index.ts
 * import { createAppSkeleton } from '@jetdevs/core/ui/layout';
 * import { Skeleton } from '@/components/ui/skeleton';
 *
 * export const { AppSkeleton, MinimalSpinner } = createAppSkeleton({ Skeleton });
 * ```
 */

// Factory functions
export { createAppSkeleton } from './AppSkeleton';

// Type exports
export type { LayoutUIComponents } from './AppSkeleton';

// Note: Sidebar and Header components are app-specific and should remain in apps
// These depend on navigation configuration, auth state, and routing which vary by app
