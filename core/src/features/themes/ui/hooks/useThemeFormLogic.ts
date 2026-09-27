"use client";

/**
 * Theme Form Logic Hook
 *
 * Provides business logic for theme create/edit forms.
 * Separates logic from UI components following the factory pattern.
 *
 * @module @jetdevs/core/features/themes/ui/hooks
 *
 * @example
 * ```typescript
 * const logic = useThemeFormLogic({
 *   mode: 'create',
 *   onCreate: async (data) => api.theme.create.mutateAsync(data),
 *   onSuccess: () => utils.theme.getAllSystem.invalidate(),
 * });
 * ```
 */

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Theme color configuration for CSS variable customization
 */
export interface ThemeColorConfig {
  /** Primary brand color (buttons, links, accents) */
  primary: string;
  /** Primary foreground color (text on primary backgrounds) */
  primaryForeground: string;
  /** Secondary color (secondary buttons, subtle backgrounds) */
  secondary: string;
  /** Secondary foreground color */
  secondaryForeground: string;
  /** Accent color (highlights, hover states) */
  accent: string;
  /** Accent foreground color */
  accentForeground: string;
  /** Background color */
  background: string;
  /** Foreground/text color */
  foreground: string;
  /** Muted background color */
  muted: string;
  /** Muted foreground color */
  mutedForeground: string;
  /** Card background color */
  card: string;
  /** Card foreground color */
  cardForeground: string;
  /** Border color */
  border: string;
  /** Input border color */
  input: string;
  /** Ring/focus color */
  ring: string;
  /** Destructive/error color */
  destructive: string;
  /** Destructive foreground color */
  destructiveForeground: string;
}

/**
 * Form data for theme create/edit
 */
export interface ThemeFormData {
  /** Internal system name (lowercase, no spaces) */
  name: string;
  /** User-facing display name */
  displayName: string;
  /** Optional description of the theme */
  description: string;
  /** CSS filename (must exist in /public/themes/) */
  cssFile: string;
  /** Whether the theme is active and available to users */
  isActive: boolean;
  /** Optional color configuration for live preview */
  colors?: Partial<ThemeColorConfig>;
}

/**
 * Theme data for edit mode
 */
export interface ThemeEditData {
  /** Theme UUID */
  uuid: string;
  /** Internal name */
  name: string;
  /** Display name */
  displayName: string;
  /** Description */
  description: string | null;
  /** CSS filename */
  cssFile: string;
  /** Whether active */
  isActive: boolean;
  /** Whether this is the default theme */
  isDefault: boolean;
  /** Optional color configuration */
  colors?: Partial<ThemeColorConfig>;
}

/**
 * Form validation errors
 */
export interface ThemeFormErrors {
  /** Name field error */
  name?: string;
  /** Display name field error */
  displayName?: string;
  /** Description field error */
  description?: string;
  /** CSS file field error */
  cssFile?: string;
  /** General form error */
  general?: string;
}

/**
 * Configuration for useThemeFormLogic hook
 */
export interface UseThemeFormLogicConfig {
  /** Form mode - create new or edit existing */
  mode: "create" | "edit";
  /** Theme data for edit mode */
  theme?: ThemeEditData | null;
  /** Callback for creating a new theme */
  onCreate?: (data: ThemeFormData) => Promise<void>;
  /** Callback for updating an existing theme */
  onUpdate?: (uuid: string, data: ThemeFormData) => Promise<void>;
  /** Callback on successful submission */
  onSuccess?: () => void;
  /** Callback on form close */
  onClose?: () => void;
  /** Whether to show live preview */
  enablePreview?: boolean;
}

/**
 * Return type for useThemeFormLogic hook
 */
export interface ThemeFormLogicReturn {
  /** Current form data */
  formData: ThemeFormData;
  /** Update form data */
  setFormData: React.Dispatch<React.SetStateAction<ThemeFormData>>;
  /** Update a single form field */
  updateField: <K extends keyof ThemeFormData>(
    field: K,
    value: ThemeFormData[K]
  ) => void;
  /** Form validation errors */
  errors: ThemeFormErrors;
  /** Whether the form is submitting */
  isSubmitting: boolean;
  /** Whether the form has unsaved changes */
  isDirty: boolean;
  /** Whether the form is valid */
  isValid: boolean;
  /** Validate the form */
  validate: () => boolean;
  /** Handle form submission */
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  /** Reset form to initial state */
  resetForm: () => void;
  /** Handle dialog close */
  handleClose: () => void;
  /** Update a color value */
  updateColor: (colorKey: keyof ThemeColorConfig, value: string) => void;
  /** Preview state for live updates */
  previewColors: Partial<ThemeColorConfig>;
  /** Whether preview is enabled */
  previewEnabled: boolean;
  /** Toggle preview mode */
  togglePreview: () => void;
  /** Mode (create or edit) */
  mode: "create" | "edit";
  /** Whether editing is disabled (e.g., default theme) */
  isEditDisabled: boolean;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_FORM_DATA: ThemeFormData = {
  name: "",
  displayName: "",
  description: "",
  cssFile: "",
  isActive: true,
  colors: {},
};

const DEFAULT_COLORS: ThemeColorConfig = {
  primary: "#0f172a",
  primaryForeground: "#ffffff",
  secondary: "#f1f5f9",
  secondaryForeground: "#0f172a",
  accent: "#f1f5f9",
  accentForeground: "#0f172a",
  background: "#ffffff",
  foreground: "#0f172a",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  card: "#ffffff",
  cardForeground: "#0f172a",
  border: "#e2e8f0",
  input: "#e2e8f0",
  ring: "#0f172a",
  destructive: "#ef4444",
  destructiveForeground: "#ffffff",
};

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate theme name
 */
function validateName(name: string): string | undefined {
  if (!name || name.trim().length === 0) {
    return "Internal name is required";
  }
  if (name.length < 2) {
    return "Internal name must be at least 2 characters";
  }
  if (name.length > 50) {
    return "Internal name must be less than 50 characters";
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return "Internal name must be lowercase letters, numbers, and hyphens only";
  }
  return undefined;
}

/**
 * Validate display name
 */
function validateDisplayName(displayName: string): string | undefined {
  if (!displayName || displayName.trim().length === 0) {
    return "Display name is required";
  }
  if (displayName.length < 2) {
    return "Display name must be at least 2 characters";
  }
  if (displayName.length > 100) {
    return "Display name must be less than 100 characters";
  }
  return undefined;
}

/**
 * Validate CSS file
 */
function validateCssFile(cssFile: string): string | undefined {
  if (!cssFile || cssFile.trim().length === 0) {
    return "CSS filename is required";
  }
  if (!cssFile.endsWith(".css")) {
    return "CSS filename must end with .css";
  }
  if (!/^[a-z0-9-]+\.css$/.test(cssFile)) {
    return "CSS filename must be lowercase letters, numbers, and hyphens only";
  }
  return undefined;
}

/**
 * Validate description
 */
function validateDescription(description: string): string | undefined {
  if (description && description.length > 500) {
    return "Description must be less than 500 characters";
  }
  return undefined;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

/**
 * Hook for theme form logic
 *
 * Provides all stateful logic needed for theme create/edit forms,
 * including validation, color management, and preview functionality.
 *
 * @param config - Configuration object
 * @returns Theme form state and actions
 */
export function useThemeFormLogic(
  config: UseThemeFormLogicConfig
): ThemeFormLogicReturn {
  const {
    mode,
    theme,
    onCreate,
    onUpdate,
    onSuccess,
    onClose,
    enablePreview = true,
  } = config;

  // Initial form data based on mode
  const initialFormData: ThemeFormData = React.useMemo(() => {
    if (mode === "edit" && theme) {
      return {
        name: theme.name,
        displayName: theme.displayName,
        description: theme.description || "",
        cssFile: theme.cssFile,
        isActive: theme.isActive,
        colors: theme.colors || {},
      };
    }
    return { ...DEFAULT_FORM_DATA };
  }, [mode, theme]);

  // State
  const [formData, setFormData] = React.useState<ThemeFormData>(initialFormData);
  const [errors, setErrors] = React.useState<ThemeFormErrors>({});
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [previewEnabled, setPreviewEnabled] = React.useState(enablePreview);

  // Track initial data for dirty checking
  const [initialData] = React.useState(initialFormData);

  // Reset form when theme changes (edit mode)
  React.useEffect(() => {
    if (mode === "edit" && theme) {
      setFormData({
        name: theme.name,
        displayName: theme.displayName,
        description: theme.description || "",
        cssFile: theme.cssFile,
        isActive: theme.isActive,
        colors: theme.colors || {},
      });
      setErrors({});
    }
  }, [mode, theme]);

  // Computed values
  const isDirty = React.useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(initialData);
  }, [formData, initialData]);

  const isEditDisabled = React.useMemo(() => {
    return mode === "edit" && theme?.isDefault === true;
  }, [mode, theme]);

  // Preview colors
  const previewColors = React.useMemo(() => {
    return {
      ...DEFAULT_COLORS,
      ...formData.colors,
    };
  }, [formData.colors]);

  // Update single field
  const updateField = React.useCallback(
    <K extends keyof ThemeFormData>(field: K, value: ThemeFormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      // Clear error for the field being updated
      if (errors[field as keyof ThemeFormErrors]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [errors]
  );

  // Update color
  const updateColor = React.useCallback(
    (colorKey: keyof ThemeColorConfig, value: string) => {
      setFormData((prev) => ({
        ...prev,
        colors: {
          ...prev.colors,
          [colorKey]: value,
        },
      }));
    },
    []
  );

  // Toggle preview
  const togglePreview = React.useCallback(() => {
    setPreviewEnabled((prev) => !prev);
  }, []);

  // Validate form
  const validate = React.useCallback((): boolean => {
    const newErrors: ThemeFormErrors = {};

    const nameError = validateName(formData.name);
    if (nameError) newErrors.name = nameError;

    const displayNameError = validateDisplayName(formData.displayName);
    if (displayNameError) newErrors.displayName = displayNameError;

    const cssFileError = validateCssFile(formData.cssFile);
    if (cssFileError) newErrors.cssFile = cssFileError;

    const descriptionError = validateDescription(formData.description);
    if (descriptionError) newErrors.description = descriptionError;

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Check if form is valid without setting errors
  const isValid = React.useMemo(() => {
    return (
      !validateName(formData.name) &&
      !validateDisplayName(formData.displayName) &&
      !validateCssFile(formData.cssFile) &&
      !validateDescription(formData.description)
    );
  }, [formData]);

  // Reset form
  const resetForm = React.useCallback(() => {
    setFormData(initialFormData);
    setErrors({});
  }, [initialFormData]);

  // Handle close
  const handleClose = React.useCallback(() => {
    if (!isSubmitting) {
      resetForm();
      onClose?.();
    }
  }, [isSubmitting, resetForm, onClose]);

  // Handle submit
  const handleSubmit = React.useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();

      if (!validate()) return;

      setIsSubmitting(true);
      setErrors({});

      try {
        if (mode === "create" && onCreate) {
          await onCreate(formData);
        } else if (mode === "edit" && onUpdate && theme) {
          await onUpdate(theme.uuid, formData);
        }

        onSuccess?.();
        resetForm();
        onClose?.();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to save theme";
        setErrors({ general: message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      mode,
      formData,
      theme,
      onCreate,
      onUpdate,
      onSuccess,
      onClose,
      validate,
      resetForm,
    ]
  );

  return {
    formData,
    setFormData,
    updateField,
    errors,
    isSubmitting,
    isDirty,
    isValid,
    validate,
    handleSubmit,
    resetForm,
    handleClose,
    updateColor,
    previewColors,
    previewEnabled,
    togglePreview,
    mode,
    isEditDisabled,
  };
}
