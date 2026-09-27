"use client";

/**
 * API Keys List Logic Hook
 *
 * Provides business logic for API keys list management.
 * Separates logic from UI components following the factory pattern.
 *
 * @module @jetdevs/core/features/api-keys/ui/hooks
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * API Key data structure for display
 */
export interface ApiKeyData {
  /** Unique identifier */
  id: number;
  /** Display name for the key */
  name: string;
  /** Masked key prefix (e.g., sk_...abc123) */
  prefix: string;
  /** Last time the key was used */
  lastUsed: Date | null;
  /** When the key was created */
  createdAt: Date;
  /** Optional expiration date */
  expiresAt?: Date | null;
  /** Whether the key has been revoked */
  revokedAt?: Date | null;
  /** Permissions assigned to the key */
  permissions?: string[];
  /** Rate limit (requests per hour) */
  rateLimit?: number;
}

/**
 * Pagination state for API keys list
 */
export interface PaginationState {
  /** Current page number (1-indexed) */
  page: number;
  /** Items per page */
  pageSize: number;
  /** Total number of items */
  total: number;
  /** Total number of pages */
  totalPages: number;
}

/**
 * Configuration for useApiKeysLogic hook
 */
export interface UseApiKeysLogicConfig {
  /** Callback when a key is revoked */
  onRevoke?: (keyId: number) => Promise<void>;
  /** Callback to refresh the keys list */
  onRefresh?: () => Promise<void>;
  /** Initial page size */
  initialPageSize?: number;
  /** Whether to include revoked keys */
  includeRevoked?: boolean;
}

/**
 * Return type for useApiKeysLogic hook
 */
export interface ApiKeysLogicReturn {
  /** List of API keys */
  keys: ApiKeyData[];
  /** Whether data is loading */
  isLoading: boolean;
  /** Error message if any */
  error: string | null;
  /** Pagination state */
  pagination: PaginationState;
  /** Set current page */
  setPage: (page: number) => void;
  /** Set page size */
  setPageSize: (size: number) => void;
  /** Filter keys by search term */
  searchTerm: string;
  /** Set search term */
  setSearchTerm: (term: string) => void;
  /** Status filter */
  statusFilter: "all" | "active" | "revoked";
  /** Set status filter */
  setStatusFilter: (filter: "all" | "active" | "revoked") => void;
  /** Handle key revocation */
  handleRevoke: (keyId: number) => void;
  /** Confirm revocation */
  confirmRevoke: () => Promise<void>;
  /** Cancel revocation */
  cancelRevoke: () => void;
  /** Key pending revocation confirmation */
  pendingRevokeKey: ApiKeyData | null;
  /** Whether revocation is in progress */
  isRevoking: boolean;
  /** Refresh the keys list */
  refresh: () => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook for API keys list management logic
 *
 * @param config - Hook configuration
 * @param initialKeys - Initial keys data
 * @returns API keys logic state and handlers
 *
 * @example
 * ```typescript
 * const logic = useApiKeysLogic({
 *   onRevoke: async (id) => api.apiKeys.revoke.mutate({ id }),
 *   onRefresh: async () => utils.apiKeys.list.invalidate(),
 * }, apiKeys);
 * ```
 */
export function useApiKeysLogic(
  config: UseApiKeysLogicConfig,
  initialKeys: ApiKeyData[] = []
): ApiKeysLogicReturn {
  const {
    onRevoke,
    onRefresh,
    initialPageSize = 10,
    includeRevoked = false,
  } = config;

  // State
  const [keys, setKeys] = React.useState<ApiKeyData[]>(initialKeys);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "active" | "revoked"
  >(includeRevoked ? "all" : "active");

  // Pagination state
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  // Revocation state
  const [pendingRevokeKey, setPendingRevokeKey] =
    React.useState<ApiKeyData | null>(null);
  const [isRevoking, setIsRevoking] = React.useState(false);

  // Update keys when initialKeys changes
  React.useEffect(() => {
    setKeys(initialKeys);
  }, [initialKeys]);

  // Filter keys based on search and status
  const filteredKeys = React.useMemo(() => {
    return keys.filter((key) => {
      const matchesSearch = key.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !key.revokedAt) ||
        (statusFilter === "revoked" && key.revokedAt);
      return matchesSearch && matchesStatus;
    });
  }, [keys, searchTerm, statusFilter]);

  // Calculate pagination
  const pagination: PaginationState = React.useMemo(() => {
    const total = filteredKeys.length;
    const totalPages = Math.ceil(total / pageSize);
    return {
      page,
      pageSize,
      total,
      totalPages,
    };
  }, [filteredKeys.length, page, pageSize]);

  // Get paginated keys
  const paginatedKeys = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredKeys.slice(start, start + pageSize);
  }, [filteredKeys, page, pageSize]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  // Handlers
  const handleRevoke = React.useCallback(
    (keyId: number) => {
      const key = keys.find((k) => k.id === keyId);
      if (key) {
        setPendingRevokeKey(key);
      }
    },
    [keys]
  );

  const confirmRevoke = React.useCallback(async () => {
    if (!pendingRevokeKey || !onRevoke) return;

    setIsRevoking(true);
    setError(null);

    try {
      await onRevoke(pendingRevokeKey.id);
      setPendingRevokeKey(null);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revoke API key";
      setError(message);
    } finally {
      setIsRevoking(false);
    }
  }, [pendingRevokeKey, onRevoke, onRefresh]);

  const cancelRevoke = React.useCallback(() => {
    setPendingRevokeKey(null);
  }, []);

  const refresh = React.useCallback(async () => {
    if (!onRefresh) return;

    setIsLoading(true);
    setError(null);

    try {
      await onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh API keys";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [onRefresh]);

  return {
    keys: paginatedKeys,
    isLoading,
    error,
    pagination,
    setPage,
    setPageSize,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    handleRevoke,
    confirmRevoke,
    cancelRevoke,
    pendingRevokeKey,
    isRevoking,
    refresh,
  };
}
