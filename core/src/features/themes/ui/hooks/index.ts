/**
 * Theme UI Hooks
 *
 * Logic hooks for theme management UI components.
 * These hooks separate business logic from presentation,
 * enabling the factory pattern for UI composition.
 *
 * @module @jetdevs/core/features/themes/ui/hooks
 */

// Theme form logic
export {
  useThemeFormLogic,
  type ThemeColorConfig,
  type ThemeFormData,
  type ThemeEditData,
  type ThemeFormErrors,
  type UseThemeFormLogicConfig,
  type ThemeFormLogicReturn,
} from "./useThemeFormLogic";

// Themes data table logic
export {
  useThemesDataTableLogic,
  type ThemeData,
  type ThemesPaginationState,
  type ThemeStatusFilter,
  type UseThemesDataTableLogicConfig,
  type ThemesDataTableLogicReturn,
} from "./useThemesDataTableLogic";
