/**
 * Auth-Aware Skeleton Loaders
 *
 * Skeleton loading states for permission-gated content.
 * Provides immediate visual feedback while permission checks complete.
 */

'use client';

import * as React from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthSkeletonProps {
  className?: string;
}

export interface AuthSkeletonConfig {
  /**
   * Skeleton component to use for loading states
   */
  Skeleton: React.ComponentType<{ className?: string }>;
  /**
   * Card component
   */
  Card: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  /**
   * CardHeader component
   */
  CardHeader: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  /**
   * CardContent component
   */
  CardContent: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  /**
   * Separator component (optional)
   */
  Separator?: React.ComponentType<{ className?: string }>;
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create Auth Skeleton components
 *
 * @example
 * import { Skeleton } from '@/components/ui/skeleton';
 * import { Card, CardHeader, CardContent } from '@/components/ui/card';
 * import { Separator } from '@/components/ui/separator';
 *
 * const {
 *   AuthPageSkeleton,
 *   AuthTableSkeleton,
 *   AuthFormSkeleton,
 *   AuthDashboardSkeleton,
 *   AuthSkeletonType,
 *   getAuthSkeleton,
 * } = createAuthSkeletons({
 *   Skeleton,
 *   Card,
 *   CardHeader,
 *   CardContent,
 *   Separator,
 * });
 */
export function createAuthSkeletons(config: AuthSkeletonConfig) {
  const { Skeleton, Card, CardHeader, CardContent, Separator } = config;

  // Default separator fallback
  const SeparatorComponent = Separator || (({ className }: { className?: string }) => (
    <hr className={`border-border ${className || ''}`} />
  ));

  // Basic page skeleton for permission-gated content
  function AuthPageSkeleton({ className }: AuthSkeletonProps) {
    return (
      <div className={`space-y-6 ${className || ''}`}>
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        <SeparatorComponent />

        {/* Content skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Table skeleton for list pages
  function AuthTableSkeleton({ className }: AuthSkeletonProps) {
    return (
      <div className={`space-y-4 ${className || ''}`}>
        {/* Table header */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex space-x-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>

        {/* Table skeleton */}
        <Card>
          <CardContent className="p-0">
            <div className="space-y-2">
              {/* Table header row */}
              <div className="flex items-center p-4 border-b">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-24 mr-8" />
                ))}
              </div>

              {/* Table rows */}
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center p-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="h-4 w-20 mr-8" />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Form skeleton for create/edit pages
  function AuthFormSkeleton({ className }: AuthSkeletonProps) {
    return (
      <div className={`space-y-6 ${className || ''}`}>
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <div className="flex space-x-2">
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Dashboard skeleton with cards and metrics
  function AuthDashboardSkeleton({ className }: AuthSkeletonProps) {
    return (
      <div className={`space-y-6 ${className || ''}`}>
        {/* Welcome header */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>

        {/* Metrics cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-8 w-8 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-12" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-48 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Loading states for different content types
  const AuthSkeletonType = {
    Page: AuthPageSkeleton,
    Table: AuthTableSkeleton,
    Form: AuthFormSkeleton,
    Dashboard: AuthDashboardSkeleton,
  } as const;

  // Utility function to pick appropriate skeleton based on content type
  function getAuthSkeleton(type: keyof typeof AuthSkeletonType) {
    return AuthSkeletonType[type];
  }

  return {
    AuthPageSkeleton,
    AuthTableSkeleton,
    AuthFormSkeleton,
    AuthDashboardSkeleton,
    AuthSkeletonType,
    getAuthSkeleton,
  };
}

// =============================================================================
// SIMPLE SKELETON COMPONENTS (without dependencies)
// =============================================================================

/**
 * Simple skeleton components that use basic CSS for styling.
 * Use these if you don't want to inject UI dependencies.
 */

const SimpleSkeletonDiv = ({ className }: { className?: string }) => (
  <div className={`animate-pulse bg-muted rounded ${className || ''}`} />
);

const SimpleCard = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={`rounded-lg border bg-card text-card-foreground shadow-sm ${className || ''}`}>
    {children}
  </div>
);

const SimpleCardHeader = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={`flex flex-col space-y-1.5 p-6 ${className || ''}`}>{children}</div>
);

const SimpleCardContent = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <div className={`p-6 pt-0 ${className || ''}`}>{children}</div>
);

/**
 * Pre-built simple skeletons using basic div elements
 */
export const SimpleAuthSkeletons = createAuthSkeletons({
  Skeleton: SimpleSkeletonDiv,
  Card: SimpleCard,
  CardHeader: SimpleCardHeader,
  CardContent: SimpleCardContent,
});
