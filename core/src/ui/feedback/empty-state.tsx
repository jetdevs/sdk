"use client";

import * as React from "react";
import { cn } from "../../lib";
import type { EmptyStateProps } from "./types";

/**
 * EmptyState component for displaying empty state messages.
 *
 * This is a pure component with no external UI dependencies,
 * so it doesn't need a factory pattern.
 *
 * @example
 * ```tsx
 * import { EmptyState } from '@yobolabs/core/ui/feedback';
 * import { Inbox } from 'lucide-react';
 *
 * <EmptyState
 *   icon={Inbox}
 *   title="No items yet"
 *   message="Get started by creating your first item."
 *   action={<Button>Create Item</Button>}
 * />
 * ```
 */
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 text-center",
        "rounded-lg border border-dashed",
        "min-h-[400px]",
        className
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      {message && (
        <p className="mb-4 text-sm text-muted-foreground max-w-sm">{message}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
