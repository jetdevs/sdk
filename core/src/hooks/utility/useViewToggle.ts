"use client";

import { useCallback, useState } from "react";

/**
 * View mode types for list/grid toggle functionality
 */
export type ViewMode = "list" | "grid" | "large-grid" | "medium-grid";

export interface UseViewToggleReturn {
  viewMode: ViewMode;
  toggleViewMode: () => void;
  setViewMode: (mode: ViewMode) => void;
  isGridView: boolean;
  isListView: boolean;
}

/**
 * Custom hook to manage view mode state (list or grid variants).
 *
 * @param initialMode - The initial view mode. Defaults to 'medium-grid'.
 * @param cycleOrder - Optional array defining the toggle cycle order
 * @returns An object containing the current view mode and functions to update it.
 *
 * @example
 * ```tsx
 * function ItemGrid() {
 *   const { viewMode, setViewMode, isGridView } = useViewToggle('medium-grid');
 *
 *   return (
 *     <div>
 *       <ViewToggleButtons
 *         onList={() => setViewMode('list')}
 *         onGrid={() => setViewMode('grid')}
 *       />
 *       {isGridView ? <GridView /> : <ListView />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useViewToggle(
  initialMode: ViewMode = "medium-grid",
  cycleOrder: ViewMode[] = ["list", "grid"]
): UseViewToggleReturn {
  const [viewMode, setViewMode] = useState<ViewMode>(initialMode);

  const toggleViewMode = useCallback(() => {
    const currentIndex = cycleOrder.indexOf(viewMode);
    const nextIndex = (currentIndex + 1) % cycleOrder.length;
    setViewMode(cycleOrder[nextIndex]);
  }, [viewMode, cycleOrder]);

  const setViewModeDirectly = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  const isGridView =
    viewMode === "grid" || viewMode === "large-grid" || viewMode === "medium-grid";
  const isListView = viewMode === "list";

  return {
    viewMode,
    toggleViewMode,
    setViewMode: setViewModeDirectly,
    isGridView,
    isListView,
  };
}
