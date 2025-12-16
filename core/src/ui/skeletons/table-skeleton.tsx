"use client";

import { cn } from "../../lib";
import type { TableSkeletonProps, TableSkeletonUIComponents } from "./types";

/**
 * Factory function to create a TableSkeleton component.
 *
 * This uses the factory pattern because it depends on UI components
 * (Table, Skeleton) that apps provide.
 *
 * @example
 * ```tsx
 * import { createTableSkeleton } from '@jetdevs/core/ui/skeletons';
 * import { Skeleton } from '@/components/ui/skeleton';
 * import {
 *   Table,
 *   TableHeader,
 *   TableBody,
 *   TableRow,
 *   TableHead,
 *   TableCell,
 * } from '@/components/ui/table';
 *
 * export const TableSkeleton = createTableSkeleton({
 *   Skeleton,
 *   Table,
 *   TableHeader,
 *   TableBody,
 *   TableRow,
 *   TableHead,
 *   TableCell,
 * });
 * ```
 */
export function createTableSkeleton(ui: TableSkeletonUIComponents) {
  const {
    Skeleton,
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
  } = ui;

  function TableSkeleton({
    rows = 5,
    columns = 4,
    className,
  }: TableSkeletonProps) {
    return (
      <div className={cn("", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={`header-${i}`}>
                  <Skeleton className="h-4 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={`row-${rowIndex}`}>
                {Array.from({ length: columns }).map((_, colIndex) => (
                  <TableCell key={`cell-${rowIndex}-${colIndex}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  TableSkeleton.displayName = "TableSkeleton";
  return TableSkeleton;
}

/**
 * Simple TableSkeleton component that doesn't require external UI components.
 * Uses basic HTML table elements with CSS-based skeleton animation.
 */
export function SimpleTableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            {Array.from({ length: columns }).map((_, i) => (
              <th key={`header-${i}`} className="p-4 text-left">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="border-b">
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={`cell-${rowIndex}-${colIndex}`} className="p-4">
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
