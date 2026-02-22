"use client";

/**
 * Organization Change Detector Hook
 *
 * Detects organization changes and removes tRPC/React Query cache
 * to prevent stale data from the previous org being shown.
 *
 * Uses removeQueries instead of invalidate to ensure cached data
 * from the previous org is not rendered while refetching.
 *
 * @module @jetdevs/core/features/organizations/ui/hooks
 */

import { useEffect, useRef } from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for useOrgChangeDetector
 */
export interface UseOrgChangeDetectorConfig {
  /** Function to get current org ID from session */
  getCurrentOrgId: () => number | null | undefined;
  /** React Query client for cache removal */
  queryClient: {
    removeQueries: () => void;
  };
  /** Whether to persist previous org ID in sessionStorage (survives page refresh) */
  persistAcrossRefresh?: boolean;
  /** Storage key for sessionStorage persistence */
  storageKey?: string;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Detects organization changes and removes all cached queries.
 *
 * @example
 * ```typescript
 * // Basic usage with useRef-based detection
 * useOrgChangeDetector({
 *   getCurrentOrgId: () => (session?.user as any)?.currentOrgId,
 *   queryClient,
 * });
 *
 * // With sessionStorage persistence (survives page refresh)
 * useOrgChangeDetector({
 *   getCurrentOrgId: () => (session?.user as any)?.currentOrgId,
 *   queryClient,
 *   persistAcrossRefresh: true,
 * });
 * ```
 */
export function useOrgChangeDetector(config: UseOrgChangeDetectorConfig) {
  const {
    getCurrentOrgId,
    queryClient,
    persistAcrossRefresh = false,
    storageKey = "previousOrgId",
  } = config;

  const previousOrgIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const currentOrgId = getCurrentOrgId();

  useEffect(() => {
    // Skip if no org ID yet
    if (!currentOrgId) return;

    if (persistAcrossRefresh) {
      // On first run, initialize from sessionStorage (survives page refresh)
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        const storedPreviousOrgId = sessionStorage.getItem(storageKey);
        previousOrgIdRef.current = storedPreviousOrgId
          ? parseInt(storedPreviousOrgId, 10)
          : currentOrgId;

        // Detect org change after page refresh
        if (previousOrgIdRef.current !== currentOrgId) {
          queryClient.removeQueries();
          previousOrgIdRef.current = currentOrgId;
          sessionStorage.setItem(storageKey, String(currentOrgId));
        }
        return;
      }

      // Detect org change within same session (SPA navigation / org switch)
      if (previousOrgIdRef.current !== null && previousOrgIdRef.current !== currentOrgId) {
        queryClient.removeQueries();
      }

      // Always update tracked org ID
      previousOrgIdRef.current = currentOrgId;
      sessionStorage.setItem(storageKey, String(currentOrgId));
    } else {
      // Ref-based detection (resets on page refresh)
      if (previousOrgIdRef.current === null) {
        previousOrgIdRef.current = currentOrgId;
        return;
      }

      if (previousOrgIdRef.current !== currentOrgId) {
        queryClient.removeQueries();
        previousOrgIdRef.current = currentOrgId;
      }
    }
  }, [currentOrgId]);
}
