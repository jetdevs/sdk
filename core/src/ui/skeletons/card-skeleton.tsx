"use client";

import * as React from "react";
import { cn } from "../../lib";
import type { CardSkeletonUIComponents, CardSkeletonProps } from "./types";

/**
 * Factory function to create a CardSkeleton component.
 *
 * This uses the factory pattern because it depends on UI components
 * (Card, Skeleton) that apps provide.
 *
 * @example
 * ```tsx
 * import { createCardSkeleton } from '@yobolabs/core/ui/skeletons';
 * import { Skeleton } from '@/components/ui/skeleton';
 * import { Card, CardHeader, CardContent } from '@/components/ui/card';
 *
 * export const CardSkeleton = createCardSkeleton({
 *   Skeleton,
 *   Card,
 *   CardHeader,
 *   CardContent,
 * });
 * ```
 */
export function createCardSkeleton(ui: CardSkeletonUIComponents) {
  const { Skeleton, Card, CardHeader, CardContent } = ui;

  function CardSkeleton({ count = 3, className }: CardSkeletonProps) {
    return (
      <div className={cn("grid gap-4", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <Card key={i} className="w-full">
            <CardHeader>
              <Skeleton className="h-6 w-2/3" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex items-center justify-between mt-4">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  CardSkeleton.displayName = "CardSkeleton";
  return CardSkeleton;
}

/**
 * Simple CardSkeleton component that doesn't require external UI components.
 * Uses basic HTML elements with CSS-based skeleton animation.
 */
export function SimpleCardSkeleton({ count = 3, className }: CardSkeletonProps) {
  return (
    <div className={cn("grid gap-4", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="w-full rounded-lg border bg-card p-6 shadow-sm"
        >
          <div className="mb-4">
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="flex items-center justify-between mt-4">
              <div className="h-8 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
