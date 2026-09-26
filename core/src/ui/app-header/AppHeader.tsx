'use client';

/**
 * THE app header (p90 batch 3d). One responsive bar for every signed-in and
 * signed-out surface on the platform — cadra-web's app, phone top bar and back
 * office, and Connect's (cadra-auth) app, account shell, back office and auth
 * pages (`AuthTopBar` is this component).
 *
 *   phone (<768px): 48px tall, 12px gutter — the p90 phone top bar
 *   desktop (≥md):  64px tall, 24px gutter — cadra-web's DesktopHeader
 *
 * Height and gutter are THEME VARIABLES (Sean #16: styles centralised in the
 * theme), read with the fallbacks above so an app that sets none renders the
 * same. Set them on `:root` (or any ancestor) to retune every header — and
 * every page that offsets by the header, e.g. `AuthShell` — in one place:
 *
 *   --app-header-height-sm   phone height        (default 3rem  / 48px)
 *   --app-header-height      ≥md height          (default 4rem  / 64px)
 *   --app-header-px-sm       phone gutter        (default 0.75rem / 12px)
 *   --app-header-px          ≥md gutter          (default 1.5rem  / 24px)
 *
 * The names are exported as `APP_HEADER_CSS_VARS`.
 *
 * Layout, left → right:  [menu (phone only)] [brand] [nav] ——— [right]
 *
 * Presentation only. No data fetching, no session, no router: apps pass the
 * brand, the link target and the nodes (credits, language, avatar menu, sign
 * out). Colours are theme tokens (`bg-background`, `border-b` → `--border`).
 * There are no variants; if a surface needs something different, it goes in a
 * slot.
 */

import * as React from 'react';
import { cn } from '../../lib';
import { BrandLockup, type BrandConfig } from './brand';

export interface AppHeaderProps {
  /** The brand, drawn with `BrandLockup`. */
  brand?: BrandConfig;
  /**
   * Replaces the brand lockup entirely — a loading skeleton, a tenant/org logo
   * `<img>`. Pass `null` to show no brand (e.g. a custom domain with no logo).
   */
  logo?: React.ReactNode;
  /**
   * Where the brand links to. The app decides: signed-in → "/dashboard".
   * Defaults to `brand.href`, then "/". `http(s)://` targets always render a
   * plain `<a>`.
   */
  logoHref?: string;
  /** aria-label of the brand link. Defaults to "Home". */
  logoLabel?: string;
  /** The app's router link (e.g. next/link) for in-app targets. Defaults to `<a>`. */
  linkComponent?: React.ElementType;
  /** Phone-only menu trigger (e.g. a Sheet trigger), drawn before the brand and hidden ≥md. */
  menu?: React.ReactNode;
  /** Beside the brand: a section title ("Back office"), a link ("Back to your apps"), nav. */
  nav?: React.ReactNode;
  /** Right-aligned actions: credits, language, avatar menu, sign out. */
  right?: React.ReactNode;
  /** Positioning only (e.g. `shrink-0`). Not for restyling — the header has one look. */
  className?: string;
  'aria-label'?: string;
}

/**
 * Theme variables the header (and anything offsetting by it) reads. Each has a
 * fallback in the class string, so none is required.
 */
export const APP_HEADER_CSS_VARS = {
  /** Phone (<md) height. Default `3rem`. */
  heightSm: '--app-header-height-sm',
  /** ≥md height. Default `4rem`. */
  height: '--app-header-height',
  /** Phone (<md) horizontal padding. Default `0.75rem`. */
  paddingXSm: '--app-header-px-sm',
  /** ≥md horizontal padding. Default `1.5rem`. */
  paddingX: '--app-header-px',
} as const;

/** True for absolute http(s) URLs, which never go through the app router. */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** Mark sizing inside the header: 28px on phones, 32px on desktop. */
function lockupMarkClass(brand: BrandConfig): string {
  const isNode = brand.mark != null && brand.mark !== false;
  return isNode ? 'h-7 w-7 md:h-8 md:w-8' : 'h-7 md:h-8';
}

export function AppHeader({
  brand,
  logo,
  logoHref,
  logoLabel,
  linkComponent,
  menu,
  nav,
  right,
  className,
  'aria-label': ariaLabel,
}: AppHeaderProps) {
  const href = logoHref ?? brand?.href ?? '/';
  const LinkComponent = (isExternalHref(href) ? 'a' : (linkComponent ?? 'a')) as React.ElementType;
  const brandNode =
    logo !== undefined ? logo : brand ? <BrandLockup {...brand} markClassName={lockupMarkClass(brand)} /> : null;

  return (
    <header
      data-testid="app-header"
      aria-label={ariaLabel}
      className={cn(
        // Height + gutter: theme variables with the p90 defaults (see APP_HEADER_CSS_VARS).
        'sticky top-0 z-50 flex h-[var(--app-header-height-sm,3rem)] items-center gap-2 border-b bg-background px-[var(--app-header-px-sm,0.75rem)] text-foreground',
        'md:h-[var(--app-header-height,4rem)] md:gap-4 md:px-[var(--app-header-px,1.5rem)]',
        className,
      )}
    >
      {menu ? (
        <div className="flex items-center md:hidden" data-slot="menu">
          {menu}
        </div>
      ) : null}
      {brandNode != null && brandNode !== false ? (
        <LinkComponent href={href} className="flex shrink-0 items-center gap-2" aria-label={logoLabel ?? (brand?.name ? `${brand.name} home` : 'Home')} data-slot="brand">
          {brandNode}
        </LinkComponent>
      ) : null}
      {nav ? (
        <div className="flex min-w-0 items-center gap-2 md:gap-4" data-slot="nav">
          {nav}
        </div>
      ) : null}
      <div className="flex-1" />
      {right ? (
        <div className="flex items-center gap-0 md:gap-4" data-slot="right">
          {right}
        </div>
      ) : null}
    </header>
  );
}
