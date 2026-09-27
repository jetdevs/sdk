"use client";

/**
 * Create API Key Dialog Factory
 *
 * Factory function for creating API key creation dialog components.
 * Includes secure key display (shown once) and copy-to-clipboard functionality.
 *
 * @module @jetdevs/core/features/api-keys/ui/factories
 *
 * @example
 * ```typescript
 * import { createCreateApiKeyDialogFactory } from '@jetdevs/core/features/api-keys/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 * import * as UI from '@/components/ui';
 *
 * export const CreateApiKeyDialog = createCreateApiKeyDialogFactory({
 *   api,
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";
import {
  useCreateApiKeyLogic,
  type CreateApiKeyFormData,
  type CreateApiKeyResult,
} from "../hooks/useCreateApiKeyLogic";

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
 * UI components required for CreateApiKeyDialog
 */
export interface CreateApiKeyDialogUIComponents {
  /** Dialog root */
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  /** Dialog content */
  DialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog header */
  DialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog title */
  DialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog description */
  DialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog footer */
  DialogFooter: React.ComponentType<{ children: React.ReactNode }>;
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
  /** Input component */
  Input: React.ComponentType<{
    id?: string;
    placeholder?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    className?: string;
    type?: string;
    min?: number;
    max?: number;
  }>;
  /** Label component */
  Label: React.ComponentType<{
    htmlFor?: string;
    children: React.ReactNode;
  }>;
  /** Select components (optional, for environment selection) */
  Select?: React.ComponentType<{
    value?: string;
    onValueChange?: (value: string) => void;
    children: React.ReactNode;
  }>;
  SelectTrigger?: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  SelectContent?: React.ComponentType<{ children: React.ReactNode }>;
  SelectItem?: React.ComponentType<{
    value: string;
    children: React.ReactNode;
  }>;
  SelectValue?: React.ComponentType<{ placeholder?: string }>;
  /** Toast notifications */
  toast: ToastInterface;
}

/**
 * API interface for CreateApiKeyDialog
 */
export interface CreateApiKeyDialogApi {
  apiKeys: {
    create: {
      useMutation: () => {
        mutateAsync: (input: {
          name: string;
          environment?: "live" | "test";
          permissions?: string[];
          rateLimit?: number;
          expiresAt?: Date | null;
        }) => Promise<{ key: string; id: number; keyPrefix: string }>;
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
 * Factory config for CreateApiKeyDialog
 */
export interface CreateApiKeyDialogFactoryConfig {
  api: CreateApiKeyDialogApi;
  ui: CreateApiKeyDialogUIComponents;
}

/**
 * Props for CreateApiKeyDialog component
 */
export interface CreateApiKeyDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback on successful creation */
  onSuccess?: (result: CreateApiKeyResult) => void;
  /** Default environment */
  defaultEnvironment?: "live" | "test";
}

// =============================================================================
// ICONS
// =============================================================================

const KeyIcon = ({ className = "" }: { className?: string }) => (
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
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
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

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a CreateApiKeyDialog component
 *
 * @param config - Factory configuration with API and UI components
 * @returns CreateApiKeyDialog component
 */
export function createCreateApiKeyDialogFactory(
  config: CreateApiKeyDialogFactoryConfig
) {
  const { api, ui } = config;
  const {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    Button,
    Input,
    Label,
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
    toast,
  } = ui;

  // Check if select components are available
  const hasSelectComponents = Select && SelectTrigger && SelectContent && SelectItem && SelectValue;

  return function CreateApiKeyDialog({
    open,
    onOpenChange,
    onSuccess,
    defaultEnvironment = "test",
  }: CreateApiKeyDialogProps) {
    // Create mutation
    const createMutation = api.apiKeys.create.useMutation();
    const utils = api.useUtils();

    // Use the logic hook
    const logic = useCreateApiKeyLogic({
      onCreate: async (data: CreateApiKeyFormData) => {
        const result = await createMutation.mutateAsync({
          name: data.name,
          environment: data.environment,
          permissions: data.scopes,
          rateLimit: data.rateLimit,
          expiresAt: data.expiresAt,
        });
        return {
          key: result.key,
          prefix: result.keyPrefix,
          id: result.id,
        };
      },
      onSuccess: async (result) => {
        await utils.apiKeys.list.invalidate();
        toast.success("API key created successfully");
        onSuccess?.(result);
      },
      onError: (error) => {
        toast.error(error.message);
      },
      defaultValues: {
        environment: defaultEnvironment,
      },
    });

    // Handle dialog close
    const handleClose = () => {
      if (!logic.isSubmitting) {
        logic.resetForm();
        onOpenChange(false);
      }
    };

    // Handle done (after key is shown)
    const handleDone = () => {
      logic.dismissGeneratedKey();
      onOpenChange(false);
    };

    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyIcon />
              Create API Key
            </DialogTitle>
            <DialogDescription>
              {logic.generatedKey
                ? "Save this API key now. You won't be able to see it again!"
                : "Generate a new API key for programmatic access"}
            </DialogDescription>
          </DialogHeader>

          {logic.generatedKey ? (
            // Show newly created key
            <div className="space-y-4 py-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <p className="font-semibold text-yellow-900 dark:text-yellow-100">
                      Save this key immediately!
                    </p>
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      This is the only time you will be able to see the full API
                      key. Store it securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Your API Key</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded font-mono break-all select-all">
                    {logic.generatedKey}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => logic.copyToClipboard()}
                    className="shrink-0"
                  >
                    {logic.isCopied ? (
                      <CheckIcon className="h-4 w-4 text-green-500" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {logic.isCopied && (
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Copied to clipboard!
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button onClick={handleDone}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            // Create form
            <div className="space-y-4 py-4">
              {/* Name field */}
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Production API Key"
                  value={logic.formData.name}
                  onChange={(e) => logic.updateField("name", e.target.value)}
                  disabled={logic.isSubmitting}
                />
                {logic.errors.name && (
                  <p className="text-sm text-destructive">{logic.errors.name}</p>
                )}
              </div>

              {/* Environment field */}
              {hasSelectComponents ? (
                <div className="space-y-2">
                  <Label htmlFor="environment">Environment</Label>
                  <Select
                    value={logic.formData.environment}
                    onValueChange={(value: string) =>
                      logic.updateField(
                        "environment",
                        value as "live" | "test"
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Test</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Test keys are for development and testing only
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="environment">Environment</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant={
                        logic.formData.environment === "test"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => logic.updateField("environment", "test")}
                      disabled={logic.isSubmitting}
                    >
                      Test
                    </Button>
                    <Button
                      type="button"
                      variant={
                        logic.formData.environment === "live"
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      onClick={() => logic.updateField("environment", "live")}
                      disabled={logic.isSubmitting}
                    >
                      Live
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Test keys are for development and testing only
                  </p>
                </div>
              )}

              {/* Permissions info */}
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="border rounded-md p-4 bg-muted">
                  <p className="text-sm text-muted-foreground">
                    API keys automatically receive all admin role permissions
                    for your organization.
                  </p>
                </div>
              </div>

              {/* Rate limit field */}
              <div className="space-y-2">
                <Label htmlFor="rateLimit">Rate Limit (requests/hour)</Label>
                <Input
                  id="rateLimit"
                  type="number"
                  value={logic.formData.rateLimit?.toString() || "1000"}
                  onChange={(e) =>
                    logic.updateField(
                      "rateLimit",
                      parseInt(e.target.value) || 1000
                    )
                  }
                  min={100}
                  max={100000}
                  disabled={logic.isSubmitting}
                />
                {logic.errors.rateLimit && (
                  <p className="text-sm text-destructive">
                    {logic.errors.rateLimit}
                  </p>
                )}
              </div>

              {/* General error */}
              {logic.error && (
                <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive">{logic.error}</p>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClose}
                  disabled={logic.isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => logic.handleSubmit()}
                  disabled={logic.isSubmitting}
                >
                  {logic.isSubmitting && <LoaderIcon className="mr-2" />}
                  {logic.isSubmitting ? "Creating..." : "Create API Key"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  };
}
