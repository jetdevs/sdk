/**
 * `@jetdevs/connect/server/owner` — p77 STORY-004.
 *
 * The RP-side credential-owner rule (`resolveConnectCredentialOwner`) and the
 * server-to-server client it asks (`ConnectOwnerClient`: `email-held`,
 * `reset-forward`). Structurally the `ResolveCredentialOwner` port of
 * `@jetdevs/core/auth`.
 *
 * SERVER ONLY — carries the RP key.
 */

export {
  CONNECT_EMAIL_HELD_PATH,
  CONNECT_RESET_FORWARD_PATH,
  createConnectOwnerClient,
  type ConnectOwnerClient,
  type ConnectOwnerClientOptions,
  type EmailHeldAnswer,
} from './client.js'

export {
  CLOSED_AUTHORITIES,
  CONNECT_ACCOUNT_SECURITY_PATH,
  CONNECT_FORGOT_PASSWORD_PAGE_PATH,
  REFUSED_ALLOCATION,
  REFUSED_CONNECT,
  REFUSED_EMAIL_TAKEN,
  REFUSED_FENCED,
  REFUSED_OWNER_UNVERIFIABLE,
  credentialOwnerSummary,
  resolveConnectCredentialOwner,
  type ConnectOwnerFlags,
  type ConnectOwnerResolverOptions,
  type CredentialOwnerSummary,
} from './resolver.js'

export type {
  CredentialOwner,
  CredentialOwnerKind,
  CredentialOwnerOperation,
  ExternalCredentialOwner,
  LocalCredentialWriteOperation,
  ResolveCredentialOwner,
  ResolveCredentialOwnerArgs,
} from './types.js'
