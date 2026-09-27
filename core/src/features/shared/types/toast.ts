/**
 * Toast Notification Interface
 *
 * Standard interface for toast notifications used by factory components.
 * Compatible with popular toast libraries like sonner, react-hot-toast, etc.
 *
 * @module @jetdevs/core/features/shared/types/toast
 */

// =============================================================================
// TOAST TYPES
// =============================================================================

/**
 * Toast position options
 */
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/**
 * Toast type variants
 */
export type ToastType = "success" | "error" | "warning" | "info" | "loading";

/**
 * Extended toast options
 */
export interface ToastOptions {
  /** Toast duration in milliseconds */
  duration?: number;
  /** Toast position */
  position?: ToastPosition;
  /** Custom toast id for dismissal */
  id?: string;
  /** Icon to display */
  icon?: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Description text (subtitle) */
  description?: string;
  /** Action button config */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Cancel button config */
  cancel?: {
    label: string;
    onClick?: () => void;
  };
  /** Callback when toast is dismissed */
  onDismiss?: () => void;
  /** Callback when toast auto-closes */
  onAutoClose?: () => void;
}

/**
 * Toast dismiss function
 * @param toastId - Optional toast id to dismiss specific toast
 */
export type ToastDismissFn = (toastId?: string) => void;

/**
 * Toast return type (usually the toast id)
 */
export type ToastReturnType = string | number;

// =============================================================================
// TOAST INTERFACE
// =============================================================================

/**
 * Standard toast interface for notifications
 *
 * This interface is compatible with common toast libraries:
 * - sonner
 * - react-hot-toast
 * - react-toastify
 *
 * @example
 * ```typescript
 * // Usage with sonner
 * import { toast } from 'sonner';
 *
 * const toastInterface: ToastInterface = {
 *   success: toast.success,
 *   error: toast.error,
 * };
 *
 * // Usage in factory config
 * const MyDialog = createMyDialogFactory({
 *   api,
 *   ui: { ...components, toast: toastInterface },
 * });
 * ```
 */
export interface ToastInterface {
  /**
   * Show a success toast notification
   * @param message - The message to display
   * @param options - Optional toast configuration
   * @returns Toast id for programmatic control
   */
  success: (message: string, options?: ToastOptions) => ToastReturnType;

  /**
   * Show an error toast notification
   * @param message - The message to display
   * @param options - Optional toast configuration
   * @returns Toast id for programmatic control
   */
  error: (message: string, options?: ToastOptions) => ToastReturnType;
}

/**
 * Extended toast interface with additional methods
 *
 * For factories that need warning, info, or loading toasts.
 */
export interface ExtendedToastInterface extends ToastInterface {
  /**
   * Show a warning toast notification
   * @param message - The message to display
   * @param options - Optional toast configuration
   * @returns Toast id for programmatic control
   */
  warning?: (message: string, options?: ToastOptions) => ToastReturnType;

  /**
   * Show an info toast notification
   * @param message - The message to display
   * @param options - Optional toast configuration
   * @returns Toast id for programmatic control
   */
  info?: (message: string, options?: ToastOptions) => ToastReturnType;

  /**
   * Show a loading toast notification
   * @param message - The message to display
   * @param options - Optional toast configuration
   * @returns Toast id for programmatic control
   */
  loading?: (message: string, options?: ToastOptions) => ToastReturnType;

  /**
   * Dismiss a toast by id or all toasts
   * @param toastId - Optional toast id to dismiss specific toast
   */
  dismiss?: ToastDismissFn;

  /**
   * Show a promise-based toast (loading -> success/error)
   * @param promise - The promise to track
   * @param messages - Messages for each state
   * @param options - Optional toast configuration
   */
  promise?: <T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: Error) => string);
    },
    options?: ToastOptions
  ) => Promise<T>;
}

/**
 * Simple toast interface (minimum required)
 *
 * Use this for factories that only need basic success/error toasts.
 */
export interface SimpleToastInterface {
  /** Show a success message */
  success: (message: string) => void;
  /** Show an error message */
  error: (message: string) => void;
}

// Import React for icon type
import type * as React from "react";
