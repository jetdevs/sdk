'use client';

/**
 * The login page's composite fields (p79 STORY-047): the settled-identifier
 * row and the password field with its reveal toggle. Text comes in as props
 * so each app speaks its own locale; the markup is cadra-web's.
 */

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../lib';
import { FloatingLabelInput, type FloatingLabelInputProps } from './FloatingField';

export interface IdentityRowProps {
  /** The identifier the user settled on (email or phone). */
  value: string;
  /** The "Not you?" control's text. */
  changeLabel: string;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * The identifier, settled: shown, not editable — the change control goes
 * back to the identifier step. Same height as a floating field so the two
 * stack evenly.
 */
export function IdentityRow({ value, changeLabel, onChange, disabled, className }: IdentityRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-md border border-input px-3 h-14 text-sm', className)}>
      <span className="truncate" data-testid="login-identifier">
        {value}
      </span>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className="shrink-0 text-muted-foreground hover:text-primary hover:underline"
      >
        {changeLabel}
      </button>
    </div>
  );
}

export interface PasswordFieldProps extends Omit<FloatingLabelInputProps, 'type' | 'trailing'> {
  /** aria-labels for the reveal toggle. */
  showLabel?: string;
  hideLabel?: string;
}

/** A floating password field with the eye toggle drawn inside it. */
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ showLabel = 'Show password', hideLabel = 'Hide password', disabled, ...props }, ref) => {
    const [shown, setShown] = React.useState(false);
    return (
      <FloatingLabelInput
        ref={ref}
        type={shown ? 'text' : 'password'}
        disabled={disabled}
        trailing={
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            disabled={disabled}
            aria-label={shown ? hideLabel : showLabel}
          >
            {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        }
        {...props}
      />
    );
  },
);
PasswordField.displayName = 'PasswordField';
