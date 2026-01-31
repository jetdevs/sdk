"use client";

/**
 * API Keys List Factory
 *
 * Factory function for creating API keys list components.
 * Apps create list components using factory functions that accept their tRPC client and UI components.
 *
 * @module @jetdevs/core/features/api-keys/ui/factories
 *
 * @example
 * ```typescript
 * import { createApiKeysListFactory } from '@jetdevs/core/features/api-keys/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const ApiKeysList = createApiKeysListFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";
import {
  useApiKeysLogic,
  type ApiKeyData,
  type ApiKeysLogicReturn,
} from "../hooks/useApiKeysLogic";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toast interface for notifications
 */
export interface ToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * UI components required for ApiKeysList
 */
export interface ApiKeysListUIComponents {
  /** Table wrapper component */
  Table: React.ComponentType<{ children: React.ReactNode }>;
  /** Table header component */
  TableHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Table body component */
  TableBody: React.ComponentType<{ children: React.ReactNode }>;
  /** Table row component */
  TableRow: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>;
  /** Table head cell component */
  TableHead: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
  }>;
  /** Table cell component */
  TableCell: React.ComponentType<{
    children: React.ReactNode;
    className?: string;
    onClick?: () => void;
  }>;
  /** Button component */
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?:
      | "default"
      | "destructive"
      | "outline"
      | "secondary"
      | "ghost"
      | "link";
    size?: "default" | "sm" | "lg" | "icon";
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Badge component */
  Badge: React.ComponentType<{
    variant?: "default" | "secondary" | "destructive" | "outline";
    className?: string;
    children: React.ReactNode;
  }>;
  /** Input component for search */
  Input: React.ComponentType<{
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    className?: string;
    type?: string;
  }>;
  /** Alert dialog root */
  AlertDialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  /** Alert dialog content */
  AlertDialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Alert dialog header */
  AlertDialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Alert dialog title */
  AlertDialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Alert dialog description */
  AlertDialogDescription: React.ComponentType<{
    asChild?: boolean;
    children: React.ReactNode;
  }>;
  /** Alert dialog footer */
  AlertDialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  /** Alert dialog cancel button */
  AlertDialogCancel: React.ComponentType<{
    disabled?: boolean;
    children: React.ReactNode;
  }>;
  /** Alert dialog action button */
  AlertDialogAction: React.ComponentType<{
    onClick: (e: React.MouseEvent) => void;
    disabled?: boolean;
    className?: string;
    children: React.ReactNode;
  }>;
  /** Toast notifications */
  toast: ToastInterface;
}

/**
 * API interface for ApiKeysList
 */
export interface ApiKeysListApi {
  apiKeys: {
    list: {
      useQuery: (input?: { includeRevoked?: boolean }) => {
        data: ApiKeyData[] | undefined;
        isLoading: boolean;
        error: Error | null;
      };
    };
    revoke: {
      useMutation: () => {
        mutateAsync: (input: { id: number }) => Promise<unknown>;
        isPending: boolean;
      };
    };
  };
  useUtils: () => {
    apiKeys: {
      list: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory config for ApiKeysList
 */
export interface ApiKeysListFactoryConfig {
  api: ApiKeysListApi;
  ui: ApiKeysListUIComponents;
}

/**
 * Props for ApiKeysList component
 */
export interface ApiKeysListProps {
  /** Include revoked keys in the list */
  includeRevoked?: boolean;
  /** Callback when a key is selected */
  onSelectKey?: (key: ApiKeyData) => void;
  /** Callback when create button is clicked */
  onCreateClick?: () => void;
  /** Additional class name for the root element */
  className?: string;
}

// =============================================================================
// ICONS
// =============================================================================

const KeyIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
  </svg>
);

const TrashIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

const CopyIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const RefreshIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
);

const AlertTriangleIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

const LoaderIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={`animate-spin ${className}`}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const PlusIcon = ({ className = "" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Format date for display
 */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand("copy");
      return true;
    } catch {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an ApiKeysList component
 *
 * @param config - Factory configuration with API and UI components
 * @returns ApiKeysList component
 */
export function createApiKeysListFactory(config: ApiKeysListFactoryConfig) {
  const { api, ui } = config;
  const {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
    Button,
    Badge,
    Input,
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
    toast,
  } = ui;

  return function ApiKeysList({
    includeRevoked = false,
    onSelectKey,
    onCreateClick,
    className = "",
  }: ApiKeysListProps) {
    // State for copy feedback
    const [copiedId, setCopiedId] = React.useState<number | null>(null);

    // Query API keys
    const { data: apiKeysData, isLoading: isQueryLoading } =
      api.apiKeys.list.useQuery({ includeRevoked });

    // Revoke mutation
    const revokeMutation = api.apiKeys.revoke.useMutation();
    const utils = api.useUtils();

    // Map API data to hook format
    const mappedKeys: ApiKeyData[] = React.useMemo(() => {
      if (!apiKeysData) return [];
      return apiKeysData.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        lastUsed: key.lastUsed,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
        revokedAt: key.revokedAt,
        permissions: key.permissions,
        rateLimit: key.rateLimit,
      }));
    }, [apiKeysData]);

    // Use the logic hook
    const logic = useApiKeysLogic(
      {
        onRevoke: async (keyId) => {
          await revokeMutation.mutateAsync({ id: keyId });
          toast.success("API key revoked successfully");
        },
        onRefresh: async () => {
          await utils.apiKeys.list.invalidate();
        },
        includeRevoked,
      },
      mappedKeys
    );

    // Handle copy
    const handleCopy = async (prefix: string, keyId: number) => {
      const success = await copyToClipboard(prefix);
      if (success) {
        toast.success("Copied to clipboard");
        setCopiedId(keyId);
        setTimeout(() => setCopiedId(null), 2000);
      } else {
        toast.error("Failed to copy to clipboard");
      }
    };

    // Combined loading state
    const isLoading = isQueryLoading || logic.isLoading;

    return (
      <div className={`space-y-4 ${className}`}>
        {/* Header with search and actions */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 max-w-sm">
            <Input
              placeholder="Search API keys..."
              value={logic.searchTerm}
              onChange={(e) => logic.setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => logic.refresh()}
              disabled={isLoading}
            >
              <RefreshIcon className="mr-2" />
              Refresh
            </Button>
            {onCreateClick && (
              <Button onClick={onCreateClick}>
                <PlusIcon className="mr-2" />
                Create API Key
              </Button>
            )}
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          <Button
            variant={logic.statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => logic.setStatusFilter("all")}
          >
            All
          </Button>
          <Button
            variant={logic.statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => logic.setStatusFilter("active")}
          >
            Active
          </Button>
          <Button
            variant={logic.statusFilter === "revoked" ? "default" : "outline"}
            size="sm"
            onClick={() => logic.setStatusFilter("revoked")}
          >
            Revoked
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoaderIcon className="h-8 w-8" />
          </div>
        ) : logic.keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <KeyIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No API keys found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {logic.searchTerm
                ? "Try adjusting your search"
                : "Create your first API key to get started"}
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logic.keys.map((key) => {
                  const isRevoked = !!key.revokedAt;
                  const isCopied = copiedId === key.id;

                  return (
                    <TableRow
                      key={key.id}
                      className={onSelectKey ? "cursor-pointer" : ""}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {key.prefix}...
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopy(key.prefix, key.id)}
                            className="h-6 w-6"
                          >
                            {isCopied ? (
                              <CheckIcon className="h-3 w-3 text-green-500" />
                            ) : (
                              <CopyIcon className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell
                        className="font-medium"
                        onClick={() => onSelectKey?.(key)}
                      >
                        {key.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRevoked ? "secondary" : "default"}>
                          {isRevoked ? "Revoked" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(key.createdAt)}</TableCell>
                      <TableCell>{formatDate(key.lastUsed)}</TableCell>
                      <TableCell className="text-right">
                        {!isRevoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => logic.handleRevoke(key.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <TrashIcon className="h-4 w-4 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination info */}
        {logic.pagination.total > 0 && (
          <div className="text-sm text-muted-foreground">
            Showing {logic.keys.length} of {logic.pagination.total} API keys
          </div>
        )}

        {/* Revoke Confirmation Dialog */}
        <AlertDialog
          open={!!logic.pendingRevokeKey}
          onOpenChange={(open) => !open && logic.cancelRevoke()}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangleIcon className="text-destructive" />
                Revoke API Key?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <div className="space-y-3">
                  <p>
                    Are you sure you want to revoke the API key{" "}
                    <strong>&quot;{logic.pendingRevokeKey?.name}&quot;</strong>?
                  </p>
                  <div className="rounded-lg border p-4 bg-muted/50 text-sm">
                    <p className="font-medium mb-2">
                      This action cannot be undone:
                    </p>
                    <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                      <li>The API key will immediately stop working</li>
                      <li>
                        Any applications using this key will lose access
                      </li>
                      <li>You will need to create a new key to restore access</li>
                    </ul>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={logic.isRevoking}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  logic.confirmRevoke();
                }}
                disabled={logic.isRevoking}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {logic.isRevoking && <LoaderIcon className="mr-2" />}
                Revoke Key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };
}
