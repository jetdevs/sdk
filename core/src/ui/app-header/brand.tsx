'use client';

/**
 * The ONE brand mark and lockup every app on the platform renders (p90 batch
 * 3d, Sean 2026-09-26: "There shouldn't be multiple versions of header
 * components.").
 *
 * Brand-agnostic: a brand is data (`BrandConfig`) — a mark node or image, an
 * optional text wordmark, a name. Core ships NO product brand, logo or brand
 * colour (Sean 2026-09-26: "many apps use core sdk. no single logo should be
 * configured in core sdk"): each app defines its own `BrandConfig` (and any
 * mark component) in its own config and passes it in.
 *
 * Colours: theme tokens only (`text-primary` for the accent, inherited
 * `currentColor` for the wordmark).
 */

import * as React from 'react';
import { cn } from '../../lib';

export interface BrandConfig {
  /** Accessible brand name, e.g. "Acme". Used as the image alt / screen-reader label. */
  name: string;
  /** The mark as a node, e.g. an app's own SVG component. Wins over `markSrc`. */
  mark?: React.ReactNode;
  /**
   * The mark as an image URL. With no `text`, this is a full logo (a PNG
   * logo, a tenant/org logo) and is drawn at logo width.
   */
  markSrc?: string;
  /** Dark-mode image. Defaults to `markSrc`. */
  markSrcDark?: string;
  /** Text wordmark beside the mark, e.g. "Acme". */
  text?: string;
  /** Suffix drawn in `text-primary`, e.g. "HQ". */
  accent?: string;
  /** Default link target when the header is given no `logoHref`. */
  href?: string;
}

export interface BrandMarkProps extends Pick<BrandConfig, 'mark' | 'markSrc' | 'markSrcDark'> {
  /** Alt text for an image mark. Omit (decorative) when a visible wordmark sits beside it. */
  alt?: string;
  /** Sizing; defaults to `h-8` (square for a node, auto width for an image). */
  className?: string;
}

/**
 * A brand's mark: its node (e.g. an app's SVG component), or its image with an optional
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

/** The text wordmark: `text` + `accent` with the suffix in the theme's primary colour. */
export function Wordmark({
  text,
  accent,
  className,
}: {
  text: string;
  /** The suffix drawn in `text-primary`, e.g. "HQ". */
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
