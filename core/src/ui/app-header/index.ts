/**
 * THE app header and brand mark (p90 batch 3d) — one header for every app on
 * the platform, brand passed as data. Core ships no product brand: each app
 * defines its own `BrandConfig` in its own config.
 *
 *   // appBrand: BrandConfig, defined in the app's own config
 *   import { AppHeader, BrandLockup, BrandMark, Wordmark,
 *            type BrandConfig } from '@jetdevs/core/ui/app-header';
 *
 *   <AppHeader brand={appBrand} logoHref="/dashboard" linkComponent={Link}
 *              right={<><Credits /><Language /><UserMenu /></>} />
 *
 * Theme: height/gutter come from `--app-header-height-sm`, `--app-header-height`,
 * `--app-header-px-sm`, `--app-header-px` (defaults 3rem/4rem/0.75rem/1.5rem).
 *
 * Consumers must let Tailwind scan this directory (source under `link:`,
 * `dist/ui/app-header` when installed) or the classes are purged.
 */

export { APP_HEADER_CSS_VARS, AppHeader, isExternalHref, type AppHeaderProps } from './AppHeader';
export {
  BrandLockup,
  BrandMark,
  Wordmark,
  type BrandConfig,
  type BrandLockupProps,
  type BrandMarkProps,
} from './brand';
