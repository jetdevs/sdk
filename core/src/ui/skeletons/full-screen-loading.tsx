"use client";

import * as React from "react";
import { cn } from "../../lib";
import type { FullScreenLoadingProps } from "./types";

/**
 * FullScreenLoading component for displaying a full-screen loading state.
 *
 * This is a pure component with no external UI dependencies,
 * so it doesn't need a factory pattern.
 *
 * @example
 * ```tsx
 * import { FullScreenLoading } from '@yobolabs/core/ui/skeletons';
 *
 * <FullScreenLoading message="Loading your data..." />
 * ```
 */
export function FullScreenLoading({
  message = "Loading...",
  className,
}: FullScreenLoadingProps) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-primary" />
        {/* Message */}
        {message && (
          <p className="text-sm text-muted-foreground animate-pulse">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Centered spinner for inline loading states.
 *
 * @example
 * ```tsx
 * import { CenteredSpinner } from '@yobolabs/core/ui/skeletons';
 *
 * {isLoading ? <CenteredSpinner /> : <Content />}
 * ```
 */
export function CenteredSpinner({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center justify-center p-8", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
    </div>
  );
}
