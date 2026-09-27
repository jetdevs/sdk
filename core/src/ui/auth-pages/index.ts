/**
 * Auth page UI — the sign-in, register and password pages every app on the
 * platform renders, as cadra-web's login page designed them (p79 STORY-047).
 *
 * Presentation only: props are text, nodes and handlers. No NextAuth, no
 * routing, no data. Colours and fonts are the consuming app's Tailwind CSS
 * variables, so one component renders each app's brand.
 *
 *   import { AuthShell, AuthTopBar, AuthCard, Wordmark, FloatingLabelInput,
 *            PasswordField, IdentityRow, AuthPrimaryButton, GoogleButton,
 *            OrDivider, AuthLink, AuthMessage } from '@jetdevs/core/ui/auth-pages';
 *
 * Consumers must let Tailwind scan this directory (source under `link:`,
 * `dist/ui/auth-pages` when installed) or the classes are purged.
 */

export {
  AuthShell,
  AuthTopBar,
  AuthCard,
  AuthMessage,
  AuthLink,
  Wordmark,
  type AuthShellProps,
  type AuthTopBarProps,
  type AuthCardProps,
  type AuthLinkProps,
} from './AuthShell';

export {
  FloatingLabelInput,
  FLOATING_FIELD_CLASS,
  useFloatState,
  type FloatingLabelInputProps,
} from './FloatingField';

export { IdentityRow, PasswordField, type IdentityRowProps, type PasswordFieldProps } from './fields';

export {
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthButtonLink,
  GoogleButton,
  GoogleMark,
  OrDivider,
  AuthSpinner,
  authButtonClass,
  type AuthButtonProps,
} from './buttons';
