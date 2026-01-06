/**
 * Display UI Components
 *
 * Components for displaying information:
 * - MetadataGrid: Display key-value pairs in a grid
 * - Breadcrumbs: Navigation breadcrumb trail
 *
 * @module @jetdevs/core/ui/display
 */

// Types
export type {
    BreadcrumbItem, BreadcrumbsFactoryConfig, BreadcrumbsProps, BreadcrumbsUIComponents, MetadataGridProps, MetadataItem
} from "./types";

// Components
export { SimpleBreadcrumbs, createBreadcrumbs } from "./breadcrumbs";
export { MetadataGrid } from "./metadata-grid";

