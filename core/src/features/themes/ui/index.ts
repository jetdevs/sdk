/**
 * Themes UI Module
 *
 * Client-side theme management components.
 * Provides logic hooks and factory functions for theme UI.
 *
 * @module @jetdevs/core/features/themes/ui
 *
 * @example
 * ```typescript
 * // Create theme dialog using factory pattern
 * import {
 *   createThemeFormDialogFactory,
 *   createThemesDataTableFactory,
 * } from '@jetdevs/core/features/themes/ui';
 * import * as UI from '@/components/ui';
 * import { api } from '@/utils/trpc';
 * import { toast } from 'sonner';
 *
 * // Create dialog components
 * export const CreateThemeDialog = createThemeFormDialogFactory({
 *   mode: 'create',
 *   api: { create: api.theme.create, useUtils: api.useUtils },
 *   ui: { ...UI, toast },
 * });
 *
 * export const EditThemeDialog = createThemeFormDialogFactory({
 *   mode: 'edit',
 *   api: { update: api.theme.update, useUtils: api.useUtils },
 *   ui: { ...UI, toast },
 * });
 *
 * // Create data table
 * export const ThemesTable = createThemesDataTableFactory({
 *   api: {
 *     getAllSystem: api.theme.getAllSystem,
 *     delete: api.theme.delete,
 *     toggleActive: api.theme.toggleActive,
 *     setDefault: api.theme.setDefault,
 *     setGlobal: api.theme.setGlobal,
 *     clearGlobal: api.theme.clearGlobal,
 *     useUtils: api.useUtils,
 *   },
 *   ui: { ...UI, toast },
 *   CreateDialog: CreateThemeDialog,
 *   EditDialog: EditThemeDialog,
 * });
 * ```
 */

// =============================================================================
// HOOKS
// =============================================================================

export {
  // Theme form logic
  useThemeFormLogic,
  type ThemeColorConfig,
  type ThemeFormData,
  type ThemeEditData,
  type ThemeFormErrors,
  type UseThemeFormLogicConfig,
  type ThemeFormLogicReturn,
  // Themes data table logic
  useThemesDataTableLogic,
  type ThemeData,
  type ThemesPaginationState,
  type ThemeStatusFilter,
  type UseThemesDataTableLogicConfig,
  type ThemesDataTableLogicReturn,
} from "./hooks";

// =============================================================================
// FACTORIES
// =============================================================================

export {
  // Theme form dialog factory
  createThemeFormDialogFactory,
  type ThemeToastInterface,
  type ThemeFormDialogUIComponents,
  type ThemeCreateApi,
  type ThemeUpdateApi,
  type ThemeFormDialogCreateConfig,
  type ThemeFormDialogEditConfig,
  type ThemeFormDialogFactoryConfig,
  type CreateThemeDialogProps,
  type EditThemeDialogProps,
  // Themes data table factory
  createThemesDataTableFactory,
  type ThemesTableToastInterface,
  type ColorSwatchProps,
  type ThemesDataTableUIComponents,
  type ThemesDataTableApi,
  type ThemesDataTableFactoryConfig,
  type ThemesDataTableProps,
} from "./factories";
