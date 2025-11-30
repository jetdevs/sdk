/**
 * React Providers Module
 *
 * Context providers for the application.
 */

// =============================================================================
// THEME PROVIDERS
// =============================================================================

export { ThemeProvider, useTheme } from './ThemeProvider';
export type {
  ThemeMode,
  ThemeContextValue,
  ThemeProviderProps,
} from './ThemeProvider';

export { UserThemeProvider, useUserTheme } from './UserThemeProvider';
export type { UserThemeProviderProps } from './UserThemeProvider';

// =============================================================================
// TRPC PROVIDERS
// =============================================================================

export {
  createTRPCProvider,
  createTRPCQueryClient,
  getBaseUrl,
  getTRPCUrl,
} from './TRPCProvider';

export type {
  TRPCProviderConfig,
  QueryClientConfig,
  TRPCProviderProps,
} from './TRPCProvider';
