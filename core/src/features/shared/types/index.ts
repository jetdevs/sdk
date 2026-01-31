/**
 * Shared Type Definitions
 *
 * Standard interfaces for UI components and API patterns.
 * These types enable SDK component factories to accept
 * app-specific implementations while maintaining type safety.
 *
 * @module @jetdevs/core/features/shared/types
 */

// =============================================================================
// UI COMPONENT TYPES
// =============================================================================

export type {
  // Dialog components
  DialogProps,
  DialogContentProps,
  DialogHeaderProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogFooterProps,
  DialogUIComponents,
  // AlertDialog components
  AlertDialogProps,
  AlertDialogContentProps,
  AlertDialogHeaderProps,
  AlertDialogTitleProps,
  AlertDialogDescriptionProps,
  AlertDialogFooterProps,
  AlertDialogCancelProps,
  AlertDialogActionProps,
  AlertDialogUIComponents,
  // Form UI components
  ButtonVariant,
  ButtonComponentProps,
  InputComponentProps,
  TextareaComponentProps,
  LabelComponentProps,
  SwitchComponentProps,
  CheckboxComponentProps,
  FormUIComponents,
  // Utility components
  BadgeVariant,
  BadgeComponentProps,
  BadgeComponent,
  SeparatorComponentProps,
  SeparatorComponent,
} from "./ui-components";

// =============================================================================
// FORM COMPONENT TYPES
// =============================================================================

export type {
  // Input types
  InputType,
  InputProps,
  // Textarea types
  TextareaProps,
  // Button types
  ButtonVariant as FormButtonVariant,
  ButtonSize,
  ButtonProps,
  // Label types
  LabelProps,
  // Switch types
  SwitchProps,
  // Checkbox types
  CheckedState,
  CheckboxProps,
  // Form field types
  FormFieldPrimitive,
  FormFieldValue,
  FormValues,
  FormFieldError,
  FormErrors,
  FormTouched,
  FormState,
} from "./form-components";

// =============================================================================
// API TYPES
// =============================================================================

export type {
  // Mutation types
  MutationResult,
  MutationFn,
  UseMutationResult,
  // Query types
  QueryResult,
  UseQueryResult,
  // Utils types
  InvalidateFn,
  QueryInvalidator,
  RouterUtils,
  // Base API interface
  BaseApiInterface,
  ApiMutationRouter,
  ApiQueryRouter,
  // tRPC patterns
  TRPCMutationOptions,
  TRPCQueryOptions,
} from "./api";

// =============================================================================
// TOAST TYPES
// =============================================================================

export type {
  // Toast types
  ToastPosition,
  ToastType,
  ToastOptions,
  ToastDismissFn,
  ToastReturnType,
  // Toast interfaces
  ToastInterface,
  ExtendedToastInterface,
  SimpleToastInterface,
} from "./toast";
