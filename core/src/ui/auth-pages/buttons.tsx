'use client';

/**
 * The login page's buttons and divider (p79 STORY-047), with cadra-web's
 * shadcn button classes inlined so no app has to inject its own Button.
 * Colours are the app's `--primary` / `--input` / `--accent` variables.
 */

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 w-full';
const PRIMARY = 'bg-primary text-primary-foreground hover:bg-primary/90';
const OUTLINE = 'border border-input bg-background hover:bg-accent hover:text-accent-foreground';

export const authButtonClass = {
  primary: cn(BUTTON_BASE, PRIMARY),
  secondary: cn(BUTTON_BASE, OUTLINE),
} as const;

export interface AuthButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shows a spinner before the label and disables the button. */
  loading?: boolean;
}

/** The full-width filled button: "Continue", "Sign In". */
export const AuthPrimaryButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ loading, disabled, className, children, ...props }, ref) => (
    <button ref={ref} className={cn(authButtonClass.primary, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
AuthPrimaryButton.displayName = 'AuthPrimaryButton';

/** The full-width bordered button. */
export const AuthSecondaryButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ loading, disabled, className, children, ...props }, ref) => (
    <button ref={ref} className={cn(authButtonClass.secondary, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  ),
);
AuthSecondaryButton.displayName = 'AuthSecondaryButton';

/** A link styled as the primary button ("Back to login" after a reset). */
export function AuthButtonLink({
  component,
  variant = 'primary',
  className,
  children,
  ...rest
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  component?: React.ElementType;
  variant?: 'primary' | 'secondary';
}) {
  const Component = (component ?? 'a') as React.ElementType;
  return (
    <Component className={cn(authButtonClass[variant], className)} {...rest}>
      {children}
    </Component>
  );
}

/** The "G" mark, drawn inline so the page loads no third-party asset. */
export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg className={cn('mr-2 h-4 w-4', className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/** "Continue with Google": the bordered button with the mark, a spinner while leaving. */
export const GoogleButton = React.forwardRef<HTMLButtonElement, AuthButtonProps>(
  ({ loading, disabled, className, children, ...props }, ref) => (
    <button ref={ref} className={cn(authButtonClass.secondary, className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <GoogleMark />}
      {children}
    </button>
  ),
);
GoogleButton.displayName = 'GoogleButton';

/** The line-through-text divider between the form and the OAuth button: `── Or ──`. */
export function OrDivider({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-card px-2 text-muted-foreground">{label}</span>
      </div>
    </div>
  );
}

/** The centred spinner a page shows while it decides what to render. */
export function AuthSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-8 w-8 animate-spin text-primary', className)} aria-hidden="true" />;
}
