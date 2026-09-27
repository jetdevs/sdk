/**
 * Standard UI Component Interfaces
 *
 * Defines interfaces for UI components that factories accept.
 * Compatible with Shadcn/ui component patterns.
 *
 * @module @jetdevs/core/features/shared/types/ui-components
 */

import type * as React from "react";

// =============================================================================
// DIALOG COMPONENTS
// =============================================================================

/**
 * Props for Dialog root component
 */
export interface DialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Dialog content */
  children: React.ReactNode;
}

/**
 * Props for DialogContent component
 */
export interface DialogContentProps {
  /** Additional CSS classes */
  className?: string;
  /** Content children */
  children: React.ReactNode;
}

/**
 * Props for DialogHeader component
 */
export interface DialogHeaderProps {
  /** Header children */
  children: React.ReactNode;
}

/**
 * Props for DialogTitle component
 */
export interface DialogTitleProps {
  /** Additional CSS classes */
  className?: string;
  /** Title content */
  children: React.ReactNode;
}

/**
 * Props for DialogDescription component
 */
export interface DialogDescriptionProps {
  /** Render as child element */
  asChild?: boolean;
  /** Description content */
  children: React.ReactNode;
}

/**
 * Props for DialogFooter component
 */
export interface DialogFooterProps {
  /** Footer children */
  children: React.ReactNode;
}

/**
 * Standard Dialog UI components interface
 * Compatible with Shadcn/ui Dialog
 */
export interface DialogUIComponents {
  /** Root dialog component */
  Dialog: React.ComponentType<DialogProps>;
  /** Dialog content wrapper */
  DialogContent: React.ComponentType<DialogContentProps>;
  /** Dialog header section */
  DialogHeader: React.ComponentType<DialogHeaderProps>;
  /** Dialog title */
  DialogTitle: React.ComponentType<DialogTitleProps>;
  /** Dialog description text */
  DialogDescription: React.ComponentType<DialogDescriptionProps>;
  /** Dialog footer section */
  DialogFooter: React.ComponentType<DialogFooterProps>;
}

// =============================================================================
// ALERT DIALOG COMPONENTS
// =============================================================================

/**
 * Props for AlertDialog root component
 */
export interface AlertDialogProps {
  /** Whether the alert dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Alert dialog content */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogContent component
 */
export interface AlertDialogContentProps {
  /** Additional CSS classes */
  className?: string;
  /** Content children */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogHeader component
 */
export interface AlertDialogHeaderProps {
  /** Header children */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogTitle component
 */
export interface AlertDialogTitleProps {
  /** Additional CSS classes */
  className?: string;
  /** Title content */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogDescription component
 */
export interface AlertDialogDescriptionProps {
  /** Render as child element */
  asChild?: boolean;
  /** Description content */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogFooter component
 */
export interface AlertDialogFooterProps {
  /** Footer children */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogCancel component
 */
export interface AlertDialogCancelProps {
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Button content */
  children: React.ReactNode;
}

/**
 * Props for AlertDialogAction component
 */
export interface AlertDialogActionProps {
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Button content */
  children: React.ReactNode;
}

/**
 * Standard AlertDialog UI components interface
 * Compatible with Shadcn/ui AlertDialog
 */
export interface AlertDialogUIComponents {
  /** Root alert dialog component */
  AlertDialog: React.ComponentType<AlertDialogProps>;
  /** Alert dialog content wrapper */
  AlertDialogContent: React.ComponentType<AlertDialogContentProps>;
  /** Alert dialog header section */
  AlertDialogHeader: React.ComponentType<AlertDialogHeaderProps>;
  /** Alert dialog title */
  AlertDialogTitle: React.ComponentType<AlertDialogTitleProps>;
  /** Alert dialog description text */
  AlertDialogDescription: React.ComponentType<AlertDialogDescriptionProps>;
  /** Alert dialog footer section */
  AlertDialogFooter: React.ComponentType<AlertDialogFooterProps>;
  /** Cancel button */
  AlertDialogCancel: React.ComponentType<AlertDialogCancelProps>;
  /** Action/confirm button */
  AlertDialogAction: React.ComponentType<AlertDialogActionProps>;
}

// =============================================================================
// FORM UI COMPONENTS
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
 * Props for Button component
 */
export interface ButtonComponentProps {
  /** Button type attribute */
  type?: "button" | "submit" | "reset";
  /** Visual variant */
  variant?: ButtonVariant;
  /** Click handler */
  onClick?: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Button content */
  children: React.ReactNode;
}

/**
 * Props for Input component
 */
export interface InputComponentProps {
  /** Input id for label association */
  id?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Input type */
  type?: string;
}

/**
 * Props for Textarea component
 */
export interface TextareaComponentProps {
  /** Textarea id for label association */
  id?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Number of visible rows */
  rows?: number;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  /** Whether the textarea is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Props for Label component
 */
export interface LabelComponentProps {
  /** Associated input id */
  htmlFor?: string;
  /** Label content */
  children: React.ReactNode;
}

/**
 * Props for Switch component
 */
export interface SwitchComponentProps {
  /** Switch id for label association */
  id?: string;
  /** Whether the switch is checked */
  checked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  disabled?: boolean;
}

/**
 * Props for Checkbox component
 */
export interface CheckboxComponentProps {
  /** Checkbox id for label association */
  id?: string;
  /** Whether the checkbox is checked */
  checked?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the checkbox is disabled */
  disabled?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standard form UI components interface
 * Compatible with Shadcn/ui form components
 */
export interface FormUIComponents {
  /** Button component */
  Button: React.ComponentType<ButtonComponentProps>;
  /** Text input component */
  Input: React.ComponentType<InputComponentProps>;
  /** Textarea component */
  Textarea: React.ComponentType<TextareaComponentProps>;
  /** Label component */
  Label: React.ComponentType<LabelComponentProps>;
  /** Toggle switch component */
  Switch: React.ComponentType<SwitchComponentProps>;
  /** Checkbox component */
  Checkbox: React.ComponentType<CheckboxComponentProps>;
}

// =============================================================================
// UTILITY COMPONENTS
// =============================================================================

/**
 * Badge variant types
 */
export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/**
 * Props for Badge component
 */
export interface BadgeComponentProps {
  /** Visual variant */
  variant?: BadgeVariant;
  /** Additional CSS classes */
  className?: string;
  /** Badge content */
  children: React.ReactNode;
}

/**
 * Badge component type
 */
export type BadgeComponent = React.ComponentType<BadgeComponentProps>;

/**
 * Props for Separator component
 */
export interface SeparatorComponentProps {
  /** Additional CSS classes */
  className?: string;
  /** Orientation */
  orientation?: "horizontal" | "vertical";
}

/**
 * Separator component type
 */
export type SeparatorComponent = React.ComponentType<SeparatorComponentProps>;
