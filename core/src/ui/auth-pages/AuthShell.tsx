'use client';

/**
 * Auth page chrome shared by every app on the platform (p79 STORY-047,
 * Sean 2026-09-22: "Let's match up the UI UX of the login forms. Use
 * cadra-web's login design." / "can't you just use the same component and
 * styles?").
 *
 * The markup and classes are cadra-web's login page as shipped in its
 * 21f1620e, lifted verbatim so the relying party and the sign-in service
 * render byte-identical chrome. Every colour, radius and font comes from
 * the app's shadcn/Tailwind CSS variables (`--background`, `--card`,
 * `--primary`, `--font-sans`, …), so the same component is indigo on Cadra
 * and green on Yobo: brand is the app's theme, never a prop here.
 *
 * Nothing in this module knows about NextAuth, routing or data. Props are
 * text, nodes and handlers.
 */

import * as React from 'react';
import { cn } from '../../lib';
import { AppHeader } from '../app-header/AppHeader';
import { Wordmark } from '../app-header/brand';

/** The wordmark lives with the brand lockup now; re-exported for existing imports. */
export { Wordmark };

export interface AuthTopBarProps {
  /** The brand mark: a `Wordmark`, an `<img>`, or nothing. */
  brand: React.ReactNode;
  /** Where the brand links to. Defaults to `/`. */
  href?: string;
  /** Render the brand link with the app's router link component (e.g. next/link). Defaults to `<a>`. */
  linkComponent?: React.ElementType;
  'aria-label'?: string;
  /** Anything to the right of the brand. */
  children?: React.ReactNode;
}

/**
 * The sticky top bar every auth page sits under. p90 batch 3d: this IS the
 * shared `AppHeader` (one header on the platform), so it has the header's
 * height — 48px on phones, 64px from md up, or whatever the theme sets via
 * `--app-header-height-sm` / `--app-header-height`.
 */
export function AuthTopBar({ brand, href = '/', linkComponent, children, ...rest }: AuthTopBarProps) {
  return (
    <AppHeader
      logo={brand}
      logoHref={href}
      logoLabel={rest['aria-label']}
      linkComponent={linkComponent}
      right={children}
      className="gap-4 px-4"
    />
  );
}

export interface AuthShellProps {
  /** The top bar, usually `<AuthTopBar …/>`. */
  topBar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Full-height page background with the content centred under the top bar.
 * Put an `AuthCard` (or any card) inside.
 *
 * The centring area is the viewport minus the header, read from the same theme
 * variables `AppHeader` uses (`--app-header-height-sm` on phones,
 * `--app-header-height` from md; defaults 3rem / 4rem), so the card stays
 * centred without a page scroll whatever height the theme gives the header.
 */
export function AuthShell({ topBar, children, className }: AuthShellProps) {
  return (
    <div className={cn('min-h-dvh bg-background', className)}>
      {topBar}
      <div
        data-slot="auth-shell-body"
        className="flex justify-center items-center min-h-[calc(100dvh_-_var(--app-header-height-sm,3rem))] md:min-h-[calc(100dvh_-_var(--app-header-height,4rem))] p-4"
      >
        {children}
      </div>
    </div>
  );
}

export interface AuthCardProps {
  /** The card title, centred. cadra-web's login says "Sign In". */
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  /** Rendered under the content as a column of small text (links). */
  footer?: React.ReactNode;
  className?: string;
  /** Override the content column's spacing; defaults to `space-y-6`. */
  contentClassName?: string;
}

/** cadra-web's shadcn Card as the login page composes it. */
export function AuthCard({ title, description, children, footer, className, contentClassName }: AuthCardProps) {
  return (
    <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm w-full max-w-md', className)}>
      {(title || description) && (
        <div className="flex flex-col space-y-1.5 p-6 text-center">
          {title && <h3 className="text-2xl font-semibold leading-none tracking-tight">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children && <div className={cn('p-6 pt-0', contentClassName ?? 'space-y-6')}>{children}</div>}
      {footer && <div className="flex items-center p-6 pt-0 flex-col space-y-2 text-sm">{footer}</div>}
    </div>
  );
}

/** A refusal (`role="alert"`) or a notice (`role="status"`), in the login page's words and colours. */
export function AuthMessage({
  tone = 'error',
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement> & { tone?: 'error' | 'status' }) {
  return tone === 'error' ? (
    <p role="alert" className={cn('text-sm text-destructive', className)} {...rest}>
      {children}
    </p>
  ) : (
    <p role="status" className={cn('text-sm text-muted-foreground text-center', className)} {...rest}>
      {children}
    </p>
  );
}

export interface AuthLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** e.g. next/link. Defaults to `<a>`. */
  component?: React.ElementType;
  /** `muted` is the "Forgot password?" look; `primary` the "Sign in" look inside a sentence. */
  tone?: 'muted' | 'primary';
}

/** The plain link under a button ("Forgot password?") or inside a sentence. */
export function AuthLink({ component, tone = 'muted', className, children, ...rest }: AuthLinkProps) {
  const Component = (component ?? 'a') as React.ElementType;
  return (
    <Component
      className={cn(
        tone === 'muted'
          ? 'text-muted-foreground hover:text-primary hover:underline'
          : 'font-semibold text-primary hover:underline',
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
