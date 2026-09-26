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
 * Consumers must let Tailwind scan this directory (source under `link:`,
 * `dist/ui/app-header` when installed) or the classes are purged.
 */

export { AppHeader, isExternalHref, type AppHeaderProps } from './AppHeader';
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
