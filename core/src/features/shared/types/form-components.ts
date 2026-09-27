/**
 * Form Component Type Definitions
 *
 * Detailed props interfaces for form-related components.
 * Extends base component interfaces with full HTML attribute support.
 *
 * @module @jetdevs/core/features/shared/types/form-components
 */

import type * as React from "react";

// =============================================================================
// INPUT PROPS
// =============================================================================

/**
 * Input type attribute values
 */
export type InputType =
  | "text"
  | "password"
  | "email"
  | "number"
  | "tel"
  | "url"
  | "search"
  | "date"
  | "time"
  | "datetime-local"
  | "month"
  | "week"
  | "color"
  | "file"
  | "hidden";

/**
 * Extended input props with HTML attributes
 */
export interface InputProps {
  /** Input id for label association */
  id?: string;
  /** Input name attribute */
  name?: string;
  /** Input type */
  type?: InputType;
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value?: string;
  /** Default value for uncontrolled inputs */
  defaultValue?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Focus handler */
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Whether the input is read-only */
  readOnly?: boolean;
  /** Whether the input is required */
  required?: boolean;
  /** Minimum value (for number/date inputs) */
  min?: string | number;
  /** Maximum value (for number/date inputs) */
  max?: string | number;
  /** Step value (for number inputs) */
  step?: string | number;
  /** Maximum length */
  maxLength?: number;
  /** Minimum length */
  minLength?: number;
  /** Pattern for validation */
  pattern?: string;
  /** Autocomplete attribute */
  autoComplete?: string;
  /** Autofocus on mount */
  autoFocus?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;
  /** Aria describedby for accessibility */
  "aria-describedby"?: string;
  /** Aria invalid for form validation */
  "aria-invalid"?: boolean;
}

// =============================================================================
// TEXTAREA PROPS
// =============================================================================

/**
 * Extended textarea props with HTML attributes
 */
export interface TextareaProps {
  /** Textarea id for label association */
  id?: string;
  /** Textarea name attribute */
  name?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Number of visible rows */
  rows?: number;
  /** Number of visible columns */
  cols?: number;
  /** Current value */
  value?: string;
  /** Default value for uncontrolled textareas */
  defaultValue?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Blur handler */
  onBlur?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  /** Focus handler */
  onFocus?: (e: React.FocusEvent<HTMLTextAreaElement>) => void;
  /** Whether the textarea is disabled */
  disabled?: boolean;
  /** Whether the textarea is read-only */
  readOnly?: boolean;
  /** Whether the textarea is required */
  required?: boolean;
  /** Maximum length */
  maxLength?: number;
  /** Minimum length */
  minLength?: number;
  /** Resize behavior */
  resize?: "none" | "both" | "horizontal" | "vertical";
  /** Autofocus on mount */
  autoFocus?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;
  /** Aria describedby for accessibility */
  "aria-describedby"?: string;
  /** Aria invalid for form validation */
  "aria-invalid"?: boolean;
}

// =============================================================================
// BUTTON PROPS
// =============================================================================

/**
 * Button variant types
 */
export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link";

/**
 * Button size types
 */
export type ButtonSize = "default" | "sm" | "lg" | "icon";

/**
 * Extended button props with HTML attributes
 */
export interface ButtonProps {
  /** Button type attribute */
  type?: "button" | "submit" | "reset";
  /** Visual variant */
  variant?: ButtonVariant;
  /** Size variant */
  size?: ButtonSize;
  /** Click handler */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether the button is in loading state */
  loading?: boolean;
  /** Autofocus on mount */
  autoFocus?: boolean;
  /** Button name attribute */
  name?: string;
  /** Button value attribute */
  value?: string;
  /** Additional CSS classes */
  className?: string;
  /** Button content */
  children: React.ReactNode;
  /** Aria label for accessibility */
  "aria-label"?: string;
  /** Aria describedby for accessibility */
  "aria-describedby"?: string;
}

// =============================================================================
// LABEL PROPS
// =============================================================================

/**
 * Extended label props with HTML attributes
 */
export interface LabelProps {
  /** Associated input id */
  htmlFor?: string;
  /** Additional CSS classes */
  className?: string;
  /** Label content */
  children: React.ReactNode;
}

// =============================================================================
// SWITCH PROPS
// =============================================================================

/**
 * Extended switch props
 */
export interface SwitchProps {
  /** Switch id for label association */
  id?: string;
  /** Switch name attribute */
  name?: string;
  /** Whether the switch is checked */
  checked?: boolean;
  /** Default checked state for uncontrolled switches */
  defaultChecked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
  /** Whether the switch is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;
  /** Aria describedby for accessibility */
  "aria-describedby"?: string;
}

// =============================================================================
// CHECKBOX PROPS
// =============================================================================

/**
 * Checkbox checked state (can be indeterminate)
 */
export type CheckedState = boolean | "indeterminate";

/**
 * Extended checkbox props
 */
export interface CheckboxProps {
  /** Checkbox id for label association */
  id?: string;
  /** Checkbox name attribute */
  name?: string;
  /** Whether the checkbox is checked */
  checked?: CheckedState;
  /** Default checked state for uncontrolled checkboxes */
  defaultChecked?: CheckedState;
  /** Change handler */
  onCheckedChange?: (checked: CheckedState) => void;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
  /** Whether the checkbox is required */
  required?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Aria label for accessibility */
  "aria-label"?: string;
  /** Aria describedby for accessibility */
  "aria-describedby"?: string;
}

// =============================================================================
// FORM FIELD VALUE TYPES
// =============================================================================

/**
 * Primitive form field values
 */
export type FormFieldPrimitive = string | number | boolean | null | undefined;

/**
 * Form field value (can be primitive or array)
 */
export type FormFieldValue = FormFieldPrimitive | FormFieldPrimitive[];

/**
 * Generic form values object
 */
export type FormValues = Record<string, FormFieldValue>;

/**
 * Form error state
 */
export interface FormFieldError {
  /** Error message */
  message: string;
  /** Error type */
  type?: string;
}

/**
 * Form errors mapping
 */
export type FormErrors<T extends FormValues> = Partial<
  Record<keyof T, FormFieldError>
>;

/**
 * Form touched state mapping
 */
export type FormTouched<T extends FormValues> = Partial<Record<keyof T, boolean>>;

/**
 * Generic form state
 */
export interface FormState<T extends FormValues> {
  /** Current form values */
  values: T;
  /** Form errors */
  errors: FormErrors<T>;
  /** Touched fields */
  touched: FormTouched<T>;
  /** Whether form is submitting */
  isSubmitting: boolean;
  /** Whether form is valid */
  isValid: boolean;
  /** Whether form has been modified */
  isDirty: boolean;
}
