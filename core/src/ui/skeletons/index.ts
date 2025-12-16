/**
 * Skeleton UI Components
 *
 * Loading skeleton components for various use cases:
 * - TableSkeleton: Table loading placeholder
 * - CardSkeleton: Card loading placeholder
 * - FullScreenLoading: Full screen loading overlay
 *
 * @module @jetdevs/core/ui/skeletons
 */

// Types
export type {
    CardSkeletonProps, CardSkeletonUIComponents, FullScreenLoadingProps, SkeletonUIComponents, TableSkeletonProps, TableSkeletonUIComponents
} from "./types";

// Components - Table Skeleton
export { SimpleTableSkeleton, createTableSkeleton } from "./table-skeleton";

// Components - Card Skeleton
export { SimpleCardSkeleton, createCardSkeleton } from "./card-skeleton";

// Components - Full Screen Loading
export { CenteredSpinner, FullScreenLoading } from "./full-screen-loading";

