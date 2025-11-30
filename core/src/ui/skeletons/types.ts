"use client";

import * as React from "react";

// =============================================================================
// Shared UI Components Interface
// =============================================================================

export interface SkeletonUIComponents {
  /** Skeleton placeholder component */
  Skeleton: React.ComponentType<{ className?: string }>;
}

export interface TableSkeletonUIComponents extends SkeletonUIComponents {
  /** Table component */
  Table: React.ComponentType<{ children?: React.ReactNode }>;
  /** Table header component */
  TableHeader: React.ComponentType<{ children?: React.ReactNode }>;
  /** Table body component */
  TableBody: React.ComponentType<{ children?: React.ReactNode }>;
  /** Table row component */
  TableRow: React.ComponentType<{ children?: React.ReactNode }>;
  /** Table head cell component */
  TableHead: React.ComponentType<{ children?: React.ReactNode }>;
  /** Table data cell component */
  TableCell: React.ComponentType<{ children?: React.ReactNode }>;
}

export interface CardSkeletonUIComponents extends SkeletonUIComponents {
  /** Card component */
  Card: React.ComponentType<{ className?: string; children?: React.ReactNode }>;
  /** Card header component */
  CardHeader: React.ComponentType<{ children?: React.ReactNode }>;
  /** Card content component */
  CardContent: React.ComponentType<{ children?: React.ReactNode }>;
}

// =============================================================================
// Table Skeleton Types
// =============================================================================

export interface TableSkeletonProps {
  /** Number of rows to display */
  rows?: number;
  /** Number of columns to display */
  columns?: number;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Card Skeleton Types
// =============================================================================

export interface CardSkeletonProps {
  /** Number of cards to display */
  count?: number;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Full Screen Loading Types
// =============================================================================

export interface FullScreenLoadingProps {
  /** Loading message to display */
  message?: string;
  /** Additional CSS classes */
  className?: string;
}
