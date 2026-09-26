'use client';

/**
 * The ONE brand mark and lockup every app on the platform renders (p90 batch
 * 3d, Sean 2026-09-26: "There shouldn't be multiple versions of header
 * components.").
 *
 * Brand-agnostic: a brand is data (`BrandConfig`) — a mark node or image, an
 * optional text wordmark, a name. Cadra's SVG mark ships as `CadraMark` and
 * `cadraBrand`; Yobo (cadra-auth's other instance) passes its own images.
 *
 * Colours: chrome uses theme tokens only (`text-primary` for the accent,
 * inherited `currentColor` for the wordmark). The hex values inside
 * `CadraMark` ARE the logo art (cadraos.com favicon.svg), not chrome.
 */

import * as React from 'react';
import { cn } from '../../lib';

export interface BrandConfig {
  /** Accessible brand name, e.g. "CadraOS" or "Yobo". Used as the image alt / screen-reader label. */
  name: string;
  /** The mark as a node, e.g. `<CadraMark />`. Wins over `markSrc`. */
  mark?: React.ReactNode;
  /**
   * The mark as an image URL. With no `text`, this is a full logo (Yobo's
   * PNG, a tenant/org logo) and is drawn at logo width.
   */
  markSrc?: string;
  /** Dark-mode image. Defaults to `markSrc`. */
  markSrcDark?: string;
  /** Text wordmark beside the mark, e.g. "Cadra". */
  text?: string;
  /** Suffix drawn in `text-primary`, e.g. "OS". */
  accent?: string;
  /** Default link target when the header is given no `logoHref`. */
  href?: string;
}

/**
 * Cadra's mark — the same art as cadraos.com's favicon.svg: a dark rounded
 * tile with a teal→sky gradient "C". The tile carries its own background, so
 * it reads on light and dark themes. Gradient id is per instance (useId).
 */
export function CadraMark({ className, title }: { className?: string; title?: string }) {
  const gradientId = `cadra-mark-${React.useId().replace(/:/g, '')}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={cn('h-8 w-8 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      data-testid="cadra-mark"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#0a0d12" />
      <rect x="0.5" y="0.5" width="63" height="63" rx="13.5" fill="none" stroke="#2dd4bf" strokeOpacity="0.25" />
      <path
        d="M44 21.5a16 16 0 1 0 0 21"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <circle cx="46" cy="32" r="4.2" fill={`url(#${gradientId})`} />
    </svg>
  );
}

/** Cadra's brand, ready to pass to `BrandLockup` / `AppHeader`. */
export const cadraBrand: BrandConfig = {
  name: 'CadraOS',
  mark: <CadraMark />,
  text: 'Cadra',
  accent: 'OS',
};

export interface BrandMarkProps extends Pick<BrandConfig, 'mark' | 'markSrc' | 'markSrcDark'> {
  /** Alt text for an image mark. Omit (decorative) when a visible wordmark sits beside it. */
  alt?: string;
  /** Sizing; defaults to `h-8` (square for a node, auto width for an image). */
  className?: string;
}

/**
 * A brand's mark: its node (e.g. `CadraMark`), or its image with an optional
 * dark-mode variant. Renders nothing when the brand has neither.
 */
export function BrandMark({ mark, markSrc, markSrcDark, alt = '', className }: BrandMarkProps) {
  if (mark != null && mark !== false) {
    if (React.isValidElement<{ className?: string }>(mark)) {
      return React.cloneElement(mark, { className: cn('h-8 w-8 shrink-0', mark.props.className, className) });
    }
    return <>{mark}</>;
  }
  if (!markSrc) return null;
  const imgClass = cn('h-8 w-auto shrink-0 object-contain', className);
  if (!markSrcDark || markSrcDark === markSrc) {
    return <img src={markSrc} alt={alt} className={imgClass} data-testid="brand-mark-img" />;
  }
  return (
    <>
      <img src={markSrc} alt={alt} className={cn(imgClass, 'block dark:hidden')} data-testid="brand-mark-img" />
      <img src={markSrcDark} alt={alt} className={cn(imgClass, 'hidden dark:block')} data-testid="brand-mark-img-dark" />
    </>
  );
}

/** The text wordmark: `Cadra` + `OS` with the suffix in the theme's primary colour. */
export function Wordmark({
  text,
  accent,
  className,
}: {
  text: string;
  /** The suffix drawn in `text-primary`, e.g. "OS". */
  accent?: string;
  className?: string;
}) {
  return (
    <span className={cn('text-lg font-bold tracking-tight', className)}>
      {text}
      {accent ? <span className="text-primary">{accent}</span> : null}
    </span>
  );
}

export interface BrandLockupProps extends BrandConfig {
  className?: string;
  /** Sizing for the mark (e.g. `h-7 w-7`). */
  markClassName?: string;
  /** Classes for the wordmark text. */
  textClassName?: string;
}

/**
 * Mark + wordmark, as every header shows the brand. With no `text`, the mark
 * (or logo image) stands alone and carries the brand name for screen readers.
 */
export function BrandLockup({
  name,
  mark,
  markSrc,
  markSrcDark,
  text,
  accent,
  className,
  markClassName,
  textClassName,
}: BrandLockupProps) {
  const hasText = !!text;
  const isImageOnly = !hasText && (mark == null || mark === false) && !!markSrc;
  return (
    <span className={cn('inline-flex items-center gap-2', className)} data-testid="brand-lockup">
      <BrandMark
        mark={mark}
        markSrc={markSrc}
        markSrcDark={markSrcDark}
        alt={isImageOnly ? name : ''}
        className={markClassName}
      />
      {hasText ? (
        <Wordmark text={text!} accent={accent} className={textClassName} />
      ) : isImageOnly ? null : (
        <span className="sr-only">{name}</span>
      )}
    </span>
  );
}
