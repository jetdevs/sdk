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
        'sticky top-0 z-50 flex h-12 items-center gap-2 border-b bg-background px-3 text-foreground',
        'md:h-16 md:gap-4 md:px-6',
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
