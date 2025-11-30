/**
 * Skeleton UI Components
 *
 * Loading skeleton components for various use cases:
 * - TableSkeleton: Table loading placeholder
 * - CardSkeleton: Card loading placeholder
 * - FullScreenLoading: Full screen loading overlay
 *
 * @module @yobolabs/core/ui/skeletons
 */

// Types
export type {
  SkeletonUIComponents,
  TableSkeletonUIComponents,
  CardSkeletonUIComponents,
  TableSkeletonProps,
  CardSkeletonProps,
  FullScreenLoadingProps,
} from "./types";

// Components - Table Skeleton
export { createTableSkeleton, SimpleTableSkeleton } from "./table-skeleton";

// Components - Card Skeleton
export { createCardSkeleton, SimpleCardSkeleton } from "./card-skeleton";

// Components - Full Screen Loading
export { FullScreenLoading, CenteredSpinner } from "./full-screen-loading";
