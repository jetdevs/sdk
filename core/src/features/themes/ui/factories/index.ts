/**
 * Theme UI Factories
 *
 * Factory functions for creating theme management UI components.
 * These factories accept app-specific UI components and API integrations,
 * returning fully functional components.
 *
 * @module @jetdevs/core/features/themes/ui/factories
 */

// Theme form dialog factory
export {
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
} from "./createThemeFormDialogFactory";

// Themes data table factory
export {
  createThemesDataTableFactory,
  type ThemesTableToastInterface,
  type ColorSwatchProps,
  type ThemesDataTableUIComponents,
  type ThemesDataTableApi,
  type ThemesDataTableFactoryConfig,
  type ThemesDataTableProps,
} from "./createThemesDataTableFactory";
