/**
 * StatusText — a list row's status as ONE quiet word, never a pill, a dot or
 * an icon. The tone only picks a theme text colour:
 *
 *   success     → normal text        (Live, On, Active, Connected, Done)
 *   muted       → muted text         (Draft, Off, Archived, Queued…)
 *   warning     → warning text       (Processing, needs attention)
 *   destructive → destructive text   (Failed, Error)
 *   info        → normal text        (Running)
 *
 * Good states stay in the normal text colour on purpose: only a problem earns
 * colour. The WORDS belong to the app (and its translations) — core ships none.
 */

import * as React from 'react';
import { cn } from '../../lib';

export type StatusTone = 'success' | 'muted' | 'warning' | 'destructive' | 'info';

export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  success: 'text-foreground',
  info: 'text-foreground',
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export interface StatusTextProps {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function StatusText({ tone = 'muted', children, className, 'data-testid': testId }: StatusTextProps) {
  return (
    <span
      className={cn('whitespace-nowrap text-xs', STATUS_TONE_CLASS[tone], className)}
      data-tone={tone}
      data-testid={testId}
    >
      {children}
    </span>
  );
}
