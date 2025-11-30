/**
 * Display UI Components
 *
 * Components for displaying information:
 * - MetadataGrid: Display key-value pairs in a grid
 * - Breadcrumbs: Navigation breadcrumb trail
 *
 * @module @yobolabs/core/ui/display
 */

// Types
export type {
  MetadataItem,
  MetadataGridProps,
  BreadcrumbItem,
  BreadcrumbsUIComponents,
  BreadcrumbsProps,
  BreadcrumbsFactoryConfig,
} from "./types";

// Components
export { MetadataGrid } from "./metadata-grid";
export { createBreadcrumbs, SimpleBreadcrumbs } from "./breadcrumbs";
