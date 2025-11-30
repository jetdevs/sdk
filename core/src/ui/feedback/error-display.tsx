"use client";

import * as React from "react";
import { cn } from "../../lib";
import type { ErrorDisplayUIComponents, ErrorDisplayProps } from "./types";

/**
 * Factory function to create an ErrorDisplay component.
 *
 * This uses the factory pattern because it depends on UI components
 * (Alert, Button) that apps provide.
 *
 * @example
 * ```tsx
 * import { createErrorDisplay } from '@yobolabs/core/ui/feedback';
 * import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
 * import { Button } from '@/components/ui/button';
 * import { AlertCircle } from 'lucide-react';
 *
 * export const ErrorDisplay = createErrorDisplay({
 *   Alert,
 *   AlertTitle,
 *   AlertDescription,
 *   Button,
 *   AlertCircleIcon: AlertCircle,
 * });
 * ```
 */
export function createErrorDisplay(ui: ErrorDisplayUIComponents) {
  const { Alert, AlertTitle, AlertDescription, Button, AlertCircleIcon } = ui;

  function ErrorDisplay({
    title = "Error",
    message,
    onRetry,
    className,
  }: ErrorDisplayProps) {
    return (
      <Alert variant="destructive" className={cn("", className)}>
        <AlertCircleIcon className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">
          {message}
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onRetry}
            >
              Try Again
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  ErrorDisplay.displayName = "ErrorDisplay";
  return ErrorDisplay;
}

/**
 * Simple ErrorDisplay component that doesn't use Alert components.
 * Use this when you don't have Alert UI components available.
 */
export function SimpleErrorDisplay({
  title = "Error",
  message,
  onRetry,
  className,
}: ErrorDisplayProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="10" strokeWidth="2" />
          <line x1="12" y1="8" x2="12" y2="12" strokeWidth="2" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
        <div className="flex-1">
          <h4 className="font-semibold">{title}</h4>
          <p className="mt-1 text-sm opacity-90">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 rounded-md border border-current px-3 py-1.5 text-sm font-medium hover:bg-destructive/10"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
