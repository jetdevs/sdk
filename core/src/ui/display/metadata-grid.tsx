"use client";

import { cn } from "../../lib";
import type { MetadataGridProps } from "./types";

const GRID_COLS_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
} as const;

/**
 * Render a value for display, handling various types.
 */
function renderValue(
  value: string | number | object | null | undefined
): string {
  if (value === null || value === undefined) return "\u2014"; // em dash
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * MetadataGrid component for displaying key-value metadata.
 *
 * This is a pure component with no external UI dependencies,
 * so it doesn't need a factory pattern.
 *
 * @example
 * ```tsx
 * import { MetadataGrid } from '@jetdevs/core/ui/display';
 *
 * <MetadataGrid
 *   items={[
 *     { label: "Created", value: "2024-01-15" },
 *     { label: "Status", value: "Active" },
 *     { label: "Type", value: "Premium" },
 *     { label: "Count", value: 42 },
 *   ]}
 *   columns={2}
 * />
 * ```
 */
export function MetadataGrid({
  items,
  columns = 2,
  className,
}: MetadataGridProps) {
  const gridColsClass = GRID_COLS_CLASS[columns];

  return (
    <div className={cn("grid gap-4", gridColsClass, className)}>
      {items.map((item, index) => (
        <div key={index} className={cn("space-y-1", item.className)}>
          <p className="text-sm font-medium">{item.label}</p>
          <p className="text-sm text-muted-foreground break-words">
            {renderValue(item.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
