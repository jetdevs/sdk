"use client";

/**
 * Create API Key Logic Hook
 *
 * Provides business logic for creating new API keys.
 * Includes secure key display (shown once) and copy-to-clipboard functionality.
 *
 * @module @jetdevs/core/features/api-keys/ui/hooks
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Form data for creating a new API key
 */
export interface CreateApiKeyFormData {
  /** Display name for the key */
  name: string;
  /** Optional expiration date */
  expiresAt?: Date | null;
  /** Optional scopes/permissions */
  scopes?: string[];
  /** Environment (live or test) */
  environment?: "live" | "test";
  /** Rate limit (requests per hour) */
  rateLimit?: number;
}

/**
 * Result of API key creation
 */
export interface CreateApiKeyResult {
  /** The full API key (shown only once) */
  key: string;
  /** Key prefix for display */
  prefix: string;
  /** Key ID */
  id: number;
}

/**
 * Configuration for useCreateApiKeyLogic hook
 */
export interface UseCreateApiKeyLogicConfig {
  /** Callback to create the API key */
  onCreate: (data: CreateApiKeyFormData) => Promise<CreateApiKeyResult>;
  /** Callback on successful creation */
  onSuccess?: (result: CreateApiKeyResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Default form values */
  defaultValues?: Partial<CreateApiKeyFormData>;
}

/**
 * Validation errors for the form
 */
export interface CreateApiKeyFormErrors {
  name?: string;
  expiresAt?: string;
  scopes?: string;
  environment?: string;
  rateLimit?: string;
}

/**
 * Return type for useCreateApiKeyLogic hook
 */
export interface CreateApiKeyLogicReturn {
  /** Current form data */
  formData: CreateApiKeyFormData;
  /** Update form data */
  setFormData: React.Dispatch<React.SetStateAction<CreateApiKeyFormData>>;
  /** Update a single form field */
  updateField: <K extends keyof CreateApiKeyFormData>(
    field: K,
    value: CreateApiKeyFormData[K]
  ) => void;
  /** Form validation errors */
  errors: CreateApiKeyFormErrors;
  /** Validate the form */
  validate: () => boolean;
  /** Submit the form */
  handleSubmit: () => Promise<void>;
  /** Whether form is submitting */
  isSubmitting: boolean;
  /** General error message */
  error: string | null;
  /** Clear all errors */
  clearErrors: () => void;
  /** Reset the form */
  resetForm: () => void;
  /** The generated key (shown once after creation) */
  generatedKey: string | null;
  /** Whether the key has been copied */
  isCopied: boolean;
  /** Copy key to clipboard */
  copyToClipboard: () => Promise<void>;
  /** Dismiss the generated key display */
  dismissGeneratedKey: () => void;
  /** Whether form is complete (key generated) */
  isComplete: boolean;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Copy text to clipboard with fallback for older browsers
 */
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
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
// HOOK
// =============================================================================

/**
 * Hook for create API key form logic
 *
 * @param config - Hook configuration
 * @returns Create API key logic state and handlers
 *
 * @example
 * ```typescript
 * const logic = useCreateApiKeyLogic({
 *   onCreate: async (data) => {
 *     const result = await api.apiKeys.create.mutate(data);
 *     return result;
 *   },
 *   onSuccess: () => {
 *     utils.apiKeys.list.invalidate();
 *   },
 * });
 *
 * // In component
 * <Input
 *   value={logic.formData.name}
 *   onChange={(e) => logic.updateField('name', e.target.value)}
 * />
 * ```
 */
export function useCreateApiKeyLogic(
  config: UseCreateApiKeyLogicConfig
): CreateApiKeyLogicReturn {
  const { onCreate, onSuccess, onError, defaultValues = {} } = config;

  // Default form state
  const initialFormData: CreateApiKeyFormData = {
    name: "",
    expiresAt: null,
    scopes: [],
    environment: "test",
    rateLimit: 1000,
    ...defaultValues,
  };

  // State
  const [formData, setFormData] =
    React.useState<CreateApiKeyFormData>(initialFormData);
  const [errors, setErrors] = React.useState<CreateApiKeyFormErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [generatedKey, setGeneratedKey] = React.useState<string | null>(null);
  const [isCopied, setIsCopied] = React.useState(false);

  // Update single field
  const updateField = React.useCallback(
    <K extends keyof CreateApiKeyFormData>(
      field: K,
      value: CreateApiKeyFormData[K]
    ) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // Clear field error when updated
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    },
    []
  );

  // Validate form
  const validate = React.useCallback((): boolean => {
    const newErrors: CreateApiKeyFormErrors = {};

    // Name validation
    if (!formData.name || formData.name.trim().length === 0) {
      newErrors.name = "Name is required";
    } else if (formData.name.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (formData.name.length > 100) {
      newErrors.name = "Name must be less than 100 characters";
    }

    // Expiration validation
    if (formData.expiresAt) {
      const now = new Date();
      if (formData.expiresAt <= now) {
        newErrors.expiresAt = "Expiration date must be in the future";
      }
    }

    // Rate limit validation
    if (formData.rateLimit !== undefined) {
      if (formData.rateLimit < 100) {
        newErrors.rateLimit = "Rate limit must be at least 100";
      } else if (formData.rateLimit > 100000) {
        newErrors.rateLimit = "Rate limit must be less than 100,000";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Submit form
  const handleSubmit = React.useCallback(async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onCreate(formData);
      setGeneratedKey(result.key);
      onSuccess?.(result);
    } catch (err) {
      const errorInstance =
        err instanceof Error ? err : new Error("Failed to create API key");
      setError(errorInstance.message);
      onError?.(errorInstance);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validate, onCreate, onSuccess, onError]);

  // Clear errors
  const clearErrors = React.useCallback(() => {
    setErrors({});
    setError(null);
  }, []);

  // Reset form
  const resetForm = React.useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
    setError(null);
    setGeneratedKey(null);
    setIsCopied(false);
  }, []);

  // Copy to clipboard
  const copyToClipboard = React.useCallback(async () => {
    if (!generatedKey) return;

    const success = await copyTextToClipboard(generatedKey);
    if (success) {
      setIsCopied(true);
      // Reset copied state after 3 seconds
      setTimeout(() => setIsCopied(false), 3000);
    }
  }, [generatedKey]);

  // Dismiss generated key
  const dismissGeneratedKey = React.useCallback(() => {
    setGeneratedKey(null);
    setIsCopied(false);
    resetForm();
  }, [resetForm]);

  return {
    formData,
    setFormData,
    updateField,
    errors,
    validate,
    handleSubmit,
    isSubmitting,
    error,
    clearErrors,
    resetForm,
    generatedKey,
    isCopied,
    copyToClipboard,
    dismissGeneratedKey,
    isComplete: generatedKey !== null,
  };
}
