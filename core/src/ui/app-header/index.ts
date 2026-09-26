/**
 * THE app header and brand mark (p90 batch 3d) — one header for every app on
 * the platform (cadra-web, Cadra/Yobo Connect), brand passed as data.
 *
 *   import { AppHeader, BrandLockup, BrandMark, CadraMark, cadraBrand,
 *            Wordmark } from '@jetdevs/core/ui/app-header';
 *
 *   <AppHeader brand={cadraBrand} logoHref="/dashboard" linkComponent={Link}
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
  CadraMark,
  Wordmark,
  cadraBrand,
  type BrandConfig,
  type BrandLockupProps,
  type BrandMarkProps,
} from './brand';
