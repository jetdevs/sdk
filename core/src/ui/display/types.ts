"use client";

import * as React from "react";

// =============================================================================
// Metadata Grid Types
// =============================================================================

export interface MetadataItem {
  /** Label for the metadata field */
  label: string;
  /** Value to display (handles string, number, object, null, undefined) */
  value: string | number | object | null | undefined;
  /** Additional CSS classes for this item */
  className?: string;
}

export interface MetadataGridProps {
  /** Array of metadata items to display */
  items: MetadataItem[];
  /** Number of columns (1-4) */
  columns?: 1 | 2 | 3 | 4;
  /** Additional CSS classes */
  className?: string;
}

// =============================================================================
// Breadcrumbs Types
// =============================================================================

export interface BreadcrumbItem {
  /** Display label */
  label: string;
  /** Link URL (if not provided, renders as plain text) */
  link?: string;
}

export interface BreadcrumbsUIComponents {
  /** Button component for back navigation */
  Button: React.ComponentType<{
    variant?: string;
    className?: string;
    onClick?: () => void;
    children?: React.ReactNode;
  }>;
  /** Link component for breadcrumb items */
  Link: React.ComponentType<{
    href: string;
    className?: string;
    children?: React.ReactNode;
  }>;
  /** Arrow left icon */
  ArrowLeftIcon: React.ComponentType<{ className?: string }>;
}

export interface BreadcrumbsProps {
  /** Breadcrumb items to display */
  items?: BreadcrumbItem[];
  /** Page title */
  title?: string;
  /** Optional badge element */
  badge?: React.ReactNode;
  /** Content for the right side */
  rightChildren?: React.ReactNode;
  /** Show back button */
  back?: boolean;
}

export interface BreadcrumbsFactoryConfig {
  /** Router hook that returns { back: () => void } */
  useRouter: () => { back: () => void };
}
