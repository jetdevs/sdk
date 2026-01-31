"use client";

/**
 * Theme Form Dialog Factory
 *
 * Creates theme create/edit dialog components using the factory pattern.
 * Apps inject their UI components and API, and receive a fully functional dialog.
 *
 * @module @jetdevs/core/features/themes/ui/factories
 *
 * @example
 * ```typescript
 * import { createThemeFormDialogFactory } from '@jetdevs/core/features/themes/ui';
 * import * as UI from '@/components/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 *
 * export const CreateThemeDialog = createThemeFormDialogFactory({
 *   mode: 'create',
 *   api: {
 *     create: api.theme.create,
 *     useUtils: api.useUtils,
 *   },
 *   ui: { ...UI, toast },
 * });
 * ```
 */

import * as React from "react";
import {
  useThemeFormLogic,
  type ThemeFormData,
  type ThemeEditData,
  type ThemeColorConfig,
} from "../hooks";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Toast interface for notifications
 */
export interface ThemeToastInterface {
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * UI components required for ThemeFormDialog
 */
export interface ThemeFormDialogUIComponents {
  /** Dialog root component */
  Dialog: React.ComponentType<{
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }>;
  /** Dialog content wrapper */
  DialogContent: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog header section */
  DialogHeader: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog title */
  DialogTitle: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  /** Dialog description text */
  DialogDescription: React.ComponentType<{ children: React.ReactNode }>;
  /** Dialog footer section */
  DialogFooter: React.ComponentType<{ children: React.ReactNode }>;
  /** Button component */
  Button: React.ComponentType<{
    type?: "button" | "submit";
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
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
  }>;
  /** Label component */
  Label: React.ComponentType<{
    htmlFor?: string;
    children: React.ReactNode;
  }>;
  /** Checkbox component */
  Checkbox: React.ComponentType<{
    id?: string;
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    disabled?: boolean;
  }>;
  /** Optional color picker component */
  ColorPicker?: React.ComponentType<{
    value: string;
    onChange: (value: string) => void;
    label?: string;
    disabled?: boolean;
  }>;
  /** Toast notifications */
  toast: ThemeToastInterface;
}

/**
 * API interface for theme create operations
 */
export interface ThemeCreateApi {
  /** Theme create mutation */
  create: {
    useMutation: () => {
      mutateAsync: (data: {
        name: string;
        displayName: string;
        description?: string;
        cssFile: string;
        isActive: boolean;
      }) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Utils for cache invalidation */
  useUtils: () => {
    theme: {
      getAllSystem: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * API interface for theme update operations
 */
export interface ThemeUpdateApi {
  /** Theme update mutation */
  update: {
    useMutation: () => {
      mutateAsync: (data: {
        uuid: string;
        name: string;
        displayName: string;
        description?: string;
        cssFile: string;
        isActive: boolean;
      }) => Promise<unknown>;
      isPending: boolean;
    };
  };
  /** Utils for cache invalidation */
  useUtils: () => {
    theme: {
      getAllSystem: {
        invalidate: () => Promise<void>;
      };
    };
  };
}

/**
 * Factory config for create mode
 */
export interface ThemeFormDialogCreateConfig {
  /** Form mode */
  mode: "create";
  /** API interface */
  api: ThemeCreateApi;
  /** UI components */
  ui: ThemeFormDialogUIComponents;
  /** Whether to show color picker section */
  showColorPicker?: boolean;
  /** Whether to show live preview */
  showPreview?: boolean;
}

/**
 * Factory config for edit mode
 */
export interface ThemeFormDialogEditConfig {
  /** Form mode */
  mode: "edit";
  /** API interface */
  api: ThemeUpdateApi;
  /** UI components */
  ui: ThemeFormDialogUIComponents;
  /** Whether to show color picker section */
  showColorPicker?: boolean;
  /** Whether to show live preview */
  showPreview?: boolean;
}

/**
 * Factory config union type
 */
export type ThemeFormDialogFactoryConfig =
  | ThemeFormDialogCreateConfig
  | ThemeFormDialogEditConfig;

/**
 * Props for create dialog
 */
export interface CreateThemeDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback on successful creation */
  onSuccess?: () => void;
}

/**
 * Props for edit dialog
 */
export interface EditThemeDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Theme to edit */
  theme: ThemeEditData | null;
  /** Callback on successful update */
  onSuccess?: () => void;
}

// =============================================================================
// ICONS
// =============================================================================

const PaletteIcon = () => (
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
  >
    <circle cx="13.5" cy="6.5" r=".5" />
    <circle cx="17.5" cy="10.5" r=".5" />
    <circle cx="8.5" cy="7.5" r=".5" />
    <circle cx="6.5" cy="12.5" r=".5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
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
// COLOR PREVIEW COMPONENT
// =============================================================================

/**
 * Simple color swatch for preview
 */
const ColorSwatch = ({
  color,
  label,
}: {
  color: string;
  label: string;
}) => (
  <div className="flex items-center gap-2">
    <div
      className="w-6 h-6 rounded border border-border"
      style={{ backgroundColor: color }}
    />
    <span className="text-xs text-muted-foreground">{label}</span>
  </div>
);

/**
 * Theme preview panel showing color swatches
 */
const ThemePreviewPanel = ({
  colors,
  enabled,
}: {
  colors: Partial<ThemeColorConfig>;
  enabled: boolean;
}) => {
  if (!enabled) return null;

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <h4 className="text-sm font-medium mb-3">Live Preview</h4>
      <div className="grid grid-cols-2 gap-2">
        {colors.primary && (
          <ColorSwatch color={colors.primary} label="Primary" />
        )}
        {colors.secondary && (
          <ColorSwatch color={colors.secondary} label="Secondary" />
        )}
        {colors.accent && (
          <ColorSwatch color={colors.accent} label="Accent" />
        )}
        {colors.background && (
          <ColorSwatch color={colors.background} label="Background" />
        )}
        {colors.foreground && (
          <ColorSwatch color={colors.foreground} label="Text" />
        )}
        {colors.destructive && (
          <ColorSwatch color={colors.destructive} label="Destructive" />
        )}
      </div>
    </div>
  );
};

// =============================================================================
// FACTORY IMPLEMENTATION
// =============================================================================

/**
 * Create a theme form dialog component (create mode)
 *
 * @param config - Factory configuration
 * @returns CreateThemeDialog component
 */
export function createThemeFormDialogFactory(
  config: ThemeFormDialogCreateConfig
): React.FC<CreateThemeDialogProps>;

/**
 * Create a theme form dialog component (edit mode)
 *
 * @param config - Factory configuration
 * @returns EditThemeDialog component
 */
export function createThemeFormDialogFactory(
  config: ThemeFormDialogEditConfig
): React.FC<EditThemeDialogProps>;

/**
 * Create a theme form dialog component
 *
 * Factory function that creates a themed dialog component for creating
 * or editing themes. The returned component handles all form logic,
 * validation, and API interactions.
 *
 * @param config - Factory configuration with API and UI components
 * @returns Dialog component based on mode
 */
export function createThemeFormDialogFactory(
  config: ThemeFormDialogFactoryConfig
): React.FC<CreateThemeDialogProps> | React.FC<EditThemeDialogProps> {
  const { mode, api, ui, showColorPicker = false, showPreview = false } = config;
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
    Checkbox,
    ColorPicker,
    toast,
  } = ui;

  if (mode === "create") {
    const createApi = api as ThemeCreateApi;

    return function CreateThemeDialog({
      open,
      onOpenChange,
      onSuccess,
    }: CreateThemeDialogProps) {
      const createMutation = createApi.create.useMutation();
      const utils = createApi.useUtils();

      const logic = useThemeFormLogic({
        mode: "create",
        enablePreview: showPreview,
        onCreate: async (data: ThemeFormData) => {
          await createMutation.mutateAsync({
            name: data.name.trim(),
            displayName: data.displayName.trim(),
            description: data.description.trim() || undefined,
            cssFile: data.cssFile.trim(),
            isActive: data.isActive,
          });
          await utils.theme.getAllSystem.invalidate();
          toast.success("Theme created successfully");
        },
        onSuccess,
        onClose: () => onOpenChange(false),
      });

      const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
          logic.resetForm();
        }
        onOpenChange(newOpen);
      };

      return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={logic.handleSubmit}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PaletteIcon />
                  Create New Theme
                </DialogTitle>
                <DialogDescription>
                  Add a new theme to the platform. The CSS file must be uploaded
                  to /public/themes/
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {/* Internal Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Internal Name</Label>
                  <Input
                    id="name"
                    value={logic.formData.name}
                    onChange={(e) => logic.updateField("name", e.target.value)}
                    placeholder="e.g., dark-mode-pro"
                    disabled={logic.isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    System identifier (lowercase, hyphens only)
                  </p>
                  {logic.errors.name && (
                    <p className="text-sm text-destructive">{logic.errors.name}</p>
                  )}
                </div>

                {/* Display Name */}
                <div className="space-y-2">
                  <Label htmlFor="displayName">Display Name</Label>
                  <Input
                    id="displayName"
                    value={logic.formData.displayName}
                    onChange={(e) =>
                      logic.updateField("displayName", e.target.value)
                    }
                    placeholder="e.g., Dark Mode Pro"
                    disabled={logic.isSubmitting}
                  />
                  {logic.errors.displayName && (
                    <p className="text-sm text-destructive">
                      {logic.errors.displayName}
                    </p>
                  )}
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Input
                    id="description"
                    value={logic.formData.description}
                    onChange={(e) =>
                      logic.updateField("description", e.target.value)
                    }
                    placeholder="A professional dark theme..."
                    disabled={logic.isSubmitting}
                  />
                  {logic.errors.description && (
                    <p className="text-sm text-destructive">
                      {logic.errors.description}
                    </p>
                  )}
                </div>

                {/* CSS Filename */}
                <div className="space-y-2">
                  <Label htmlFor="cssFile">CSS Filename</Label>
                  <Input
                    id="cssFile"
                    value={logic.formData.cssFile}
                    onChange={(e) =>
                      logic.updateField("cssFile", e.target.value)
                    }
                    placeholder="e.g., dark-mode-pro.css"
                    disabled={logic.isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must match the filename in /public/themes/
                  </p>
                  {logic.errors.cssFile && (
                    <p className="text-sm text-destructive">
                      {logic.errors.cssFile}
                    </p>
                  )}
                </div>

                {/* Color Picker Section */}
                {showColorPicker && ColorPicker && (
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="text-sm font-medium">Theme Colors</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <ColorPicker
                        value={logic.previewColors.primary || "#0f172a"}
                        onChange={(value) => logic.updateColor("primary", value)}
                        label="Primary"
                        disabled={logic.isSubmitting}
                      />
                      <ColorPicker
                        value={logic.previewColors.secondary || "#f1f5f9"}
                        onChange={(value) => logic.updateColor("secondary", value)}
                        label="Secondary"
                        disabled={logic.isSubmitting}
                      />
                      <ColorPicker
                        value={logic.previewColors.accent || "#f1f5f9"}
                        onChange={(value) => logic.updateColor("accent", value)}
                        label="Accent"
                        disabled={logic.isSubmitting}
                      />
                      <ColorPicker
                        value={logic.previewColors.destructive || "#ef4444"}
                        onChange={(value) =>
                          logic.updateColor("destructive", value)
                        }
                        label="Destructive"
                        disabled={logic.isSubmitting}
                      />
                    </div>
                  </div>
                )}

                {/* Preview Panel */}
                {showPreview && (
                  <ThemePreviewPanel
                    colors={logic.previewColors}
                    enabled={logic.previewEnabled}
                  />
                )}

                {/* Active Status */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isActive"
                    checked={logic.formData.isActive}
                    onCheckedChange={(checked) =>
                      logic.updateField("isActive", checked === true)
                    }
                    disabled={logic.isSubmitting}
                  />
                  <Label htmlFor="isActive">
                    Active (available for users)
                  </Label>
                </div>

                {/* General Error */}
                {logic.errors.general && (
                  <p className="text-sm text-destructive">
                    {logic.errors.general}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={logic.isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={logic.isSubmitting}>
                  {logic.isSubmitting ? (
                    <>
                      <LoaderIcon className="mr-2" />
                      Creating...
                    </>
                  ) : (
                    "Create Theme"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      );
    };
  }

  // Edit mode
  const updateApi = api as ThemeUpdateApi;

  return function EditThemeDialog({
    open,
    onOpenChange,
    theme,
    onSuccess,
  }: EditThemeDialogProps) {
    const updateMutation = updateApi.update.useMutation();
    const utils = updateApi.useUtils();

    const logic = useThemeFormLogic({
      mode: "edit",
      theme,
      enablePreview: showPreview,
      onUpdate: async (uuid: string, data: ThemeFormData) => {
        await updateMutation.mutateAsync({
          uuid,
          name: data.name.trim(),
          displayName: data.displayName.trim(),
          description: data.description.trim() || undefined,
          cssFile: data.cssFile.trim(),
          isActive: data.isActive,
        });
        await utils.theme.getAllSystem.invalidate();
        toast.success("Theme updated successfully");
      },
      onSuccess,
      onClose: () => onOpenChange(false),
    });

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={logic.handleSubmit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PaletteIcon />
                Edit Theme
              </DialogTitle>
              <DialogDescription>
                Update theme information. Make sure the CSS file exists in
                /public/themes/
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Internal Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-name">Internal Name</Label>
                <Input
                  id="edit-name"
                  value={logic.formData.name}
                  onChange={(e) => logic.updateField("name", e.target.value)}
                  placeholder="e.g., dark-mode-pro"
                  disabled={logic.isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  System identifier (lowercase, hyphens only)
                </p>
                {logic.errors.name && (
                  <p className="text-sm text-destructive">{logic.errors.name}</p>
                )}
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label htmlFor="edit-displayName">Display Name</Label>
                <Input
                  id="edit-displayName"
                  value={logic.formData.displayName}
                  onChange={(e) =>
                    logic.updateField("displayName", e.target.value)
                  }
                  placeholder="e.g., Dark Mode Pro"
                  disabled={logic.isSubmitting}
                />
                {logic.errors.displayName && (
                  <p className="text-sm text-destructive">
                    {logic.errors.displayName}
                  </p>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="edit-description">Description (Optional)</Label>
                <Input
                  id="edit-description"
                  value={logic.formData.description}
                  onChange={(e) =>
                    logic.updateField("description", e.target.value)
                  }
                  placeholder="A professional dark theme..."
                  disabled={logic.isSubmitting}
                />
                {logic.errors.description && (
                  <p className="text-sm text-destructive">
                    {logic.errors.description}
                  </p>
                )}
              </div>

              {/* CSS Filename */}
              <div className="space-y-2">
                <Label htmlFor="edit-cssFile">CSS Filename</Label>
                <Input
                  id="edit-cssFile"
                  value={logic.formData.cssFile}
                  onChange={(e) =>
                    logic.updateField("cssFile", e.target.value)
                  }
                  placeholder="e.g., dark-mode-pro.css"
                  disabled={logic.isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Must match the filename in /public/themes/
                </p>
                {logic.errors.cssFile && (
                  <p className="text-sm text-destructive">
                    {logic.errors.cssFile}
                  </p>
                )}
              </div>

              {/* Color Picker Section */}
              {showColorPicker && ColorPicker && (
                <div className="space-y-3 border-t pt-4">
                  <h4 className="text-sm font-medium">Theme Colors</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <ColorPicker
                      value={logic.previewColors.primary || "#0f172a"}
                      onChange={(value) => logic.updateColor("primary", value)}
                      label="Primary"
                      disabled={logic.isSubmitting}
                    />
                    <ColorPicker
                      value={logic.previewColors.secondary || "#f1f5f9"}
                      onChange={(value) => logic.updateColor("secondary", value)}
                      label="Secondary"
                      disabled={logic.isSubmitting}
                    />
                    <ColorPicker
                      value={logic.previewColors.accent || "#f1f5f9"}
                      onChange={(value) => logic.updateColor("accent", value)}
                      label="Accent"
                      disabled={logic.isSubmitting}
                    />
                    <ColorPicker
                      value={logic.previewColors.destructive || "#ef4444"}
                      onChange={(value) =>
                        logic.updateColor("destructive", value)
                      }
                      label="Destructive"
                      disabled={logic.isSubmitting}
                    />
                  </div>
                </div>
              )}

              {/* Preview Panel */}
              {showPreview && (
                <ThemePreviewPanel
                  colors={logic.previewColors}
                  enabled={logic.previewEnabled}
                />
              )}

              {/* Active Status */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-isActive"
                  checked={logic.formData.isActive}
                  onCheckedChange={(checked) =>
                    logic.updateField("isActive", checked === true)
                  }
                  disabled={logic.isSubmitting || logic.isEditDisabled}
                />
                <Label htmlFor="edit-isActive">
                  Active (available for users)
                </Label>
                {logic.isEditDisabled && (
                  <span className="text-xs text-muted-foreground">
                    (Default theme cannot be deactivated)
                  </span>
                )}
              </div>

              {/* General Error */}
              {logic.errors.general && (
                <p className="text-sm text-destructive">
                  {logic.errors.general}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={logic.isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={logic.isSubmitting}>
                {logic.isSubmitting ? (
                  <>
                    <LoaderIcon className="mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  };
}
