'use client';

import * as React from 'react';

// =============================================================================
// UI COMPONENT TYPES
// =============================================================================

/**
 * UI components that must be injected to create layout skeletons.
 */
export interface LayoutUIComponents {
  Skeleton: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create layout skeleton components with injected UI dependencies.
 *
 * @param ui - UI components to use for rendering (Skeleton)
 * @returns An object containing AppSkeleton and MinimalSpinner components
 *
 * @example
 * ```typescript
 * import { createAppSkeleton } from '@yobolabs/core/ui/layout';
 * import { Skeleton } from '@/components/ui/skeleton';
 *
 * export const { AppSkeleton, MinimalSpinner } = createAppSkeleton({ Skeleton });
 * ```
 */
export function createAppSkeleton(ui: LayoutUIComponents) {
  const { Skeleton } = ui;

  /**
   * Full-page skeleton that matches a typical app layout structure.
   * Used during authentication checks and initial page loads.
   *
   * @example
   * ```tsx
   * // In a suspense boundary or loading state
   * <Suspense fallback={<AppSkeleton />}>
   *   <Dashboard />
   * </Suspense>
   * ```
   */
  function AppSkeleton() {
    return (
      <div className="flex min-h-screen flex-col">
        {/* Header skeleton */}
        <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="flex-1" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </header>

        <div className="flex flex-1">
          {/* Sidebar skeleton - desktop only */}
          <aside
            className="hidden md:flex flex-col border-r bg-sidebar"
            style={{ width: 'var(--sidebar-width, 256px)' }}
          >
            {/* Org switcher skeleton */}
            <div className="border-b p-4">
              <Skeleton className="h-9 w-full" />
            </div>

            {/* Nav items skeleton */}
            <div className="flex-1 p-4 space-y-6">
              {/* Nav group 1 */}
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-9 w-full" />
              </div>

              {/* Nav group 2 */}
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </aside>

          {/* Main content skeleton */}
          <main className="flex-1 p-6">
            <div className="space-y-6">
              {/* Page header */}
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>

              {/* Content cards */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
                <Skeleton className="h-32 rounded-lg" />
              </div>

              {/* Table/list skeleton */}
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  /**
   * Minimal loading spinner for very brief transitions.
   * Use sparingly - prefer AppSkeleton for most cases.
   */
  function MinimalSpinner() {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return { AppSkeleton, MinimalSpinner };
}
