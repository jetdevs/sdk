'use client';

/**
 * Floating-label input — the platform's one label system for text fields
 * (cadra-web `DESIGN.md`, "Core principle: self-evident, not explained"):
 * the label sits inside the field as the hint while it is empty and
 * unfocused, and shrinks to the top-left the moment it is focused or holds
 * a value. Never a label hanging above a field.
 *
 * Moved here from
 * `cadra-web/src/extensions/agents/components/detail/panel/FloatingField.tsx`
 * (`FloatingLabelInput`) for p79 STORY-047 so cadra-web and the sign-in
 * service render the same field; that file now re-exports this one. The
 * textarea and select variants stay in cadra-web (they wrap its shadcn
 * Select).
 *
 * Float is JS-driven (`focused || filled`) so it is deterministic and does
 * not rely on the fragile `:placeholder-shown` variant ordering.
 */

import * as React from 'react';
import { cn } from '../../lib';

export const FLOATING_FIELD_CLASS =
  'peer w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const LABEL = 'pointer-events-none absolute left-3 origin-left text-muted-foreground transition-all duration-150';
const LABEL_FLOATED = 'top-1.5 text-[11px] font-medium';

export function useFloatState(value: unknown) {
  const [focused, setFocused] = React.useState(false);
  const filled = value != null && String(value).length > 0;
  return { focused, setFocused, floated: focused || filled };
}

export interface FloatingLabelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  containerClassName?: string;
  /** Optional format example (e.g. "xapp-…") — revealed only once the label
   *  has floated (on focus), so it never collides with the hint label. */
  placeholder?: string;
  /** Keep the label floated and the placeholder visible while empty — for a
   *  field whose EMPTY state is meaningful (e.g. "Default (50 steps)"). */
  showEmptyPlaceholder?: boolean;
  /** Opt-in error state: destructive border + label and `aria-invalid`. */
  invalid?: boolean;
  /** Something drawn inside the field on the right (a reveal toggle). */
  trailing?: React.ReactNode;
}

export const FloatingLabelInput = React.forwardRef<HTMLInputElement, FloatingLabelInputProps>(
  (
    { label, id, value, onFocus, onBlur, className, containerClassName, disabled, placeholder, showEmptyPlaceholder, invalid, trailing, ...props },
    ref,
  ) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const { focused, setFocused, floated: floatedByState } = useFloatState(value);
    const floated = floatedByState || !!showEmptyPlaceholder;
    return (
      <div className={cn('relative', containerClassName)}>
        <input
          ref={ref}
          id={inputId}
          value={value}
          disabled={disabled}
          placeholder={focused || showEmptyPlaceholder ? placeholder : undefined}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          aria-invalid={invalid || undefined}
          className={cn(
            FLOATING_FIELD_CLASS,
            'h-14 pb-1 pt-5',
            invalid && 'border-destructive focus-visible:ring-destructive',
            trailing && 'pr-10',
            className,
          )}
          {...props}
        />
        <label
          htmlFor={inputId}
          className={cn(
            LABEL,
            floated ? LABEL_FLOATED : 'top-1/2 -translate-y-1/2 text-sm font-normal',
            invalid && 'text-destructive',
            disabled && 'opacity-50',
          )}
        >
          {label}
        </label>
        {trailing}
      </div>
    );
  },
);
FloatingLabelInput.displayName = 'FloatingLabelInput';
