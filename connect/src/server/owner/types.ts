/**
 * p77 STORY-004 — the credential-owner PORT, structurally identical to
 * `@jetdevs/core/auth`'s `CredentialOwner` / `ResolveCredentialOwner`.
 *
 * WHY A COPY. `@jetdevs/connect` carries no dependency on `@jetdevs/core`
 * (STORY-003's rule: the SDK's dependency list stays empty), and every RP
 * links both packages. The resolver built here is handed to core's writers
 * as their `resolveCredentialOwner`; TypeScript checks the two shapes
 * structurally, so the copy must stay field-for-field equal to
 * `core/src/modules/auth/credential-owner.ts`. A drift shows up as a type
 * error at the RP's wiring site, never at runtime.
 */

export type LocalCredentialWriteOperation =
  | 'register'
  | 'invite'
  | 'create'
  | 'update'
  | 'change-password'
  | 'reset'
  | 'reset-request'

export type CredentialOwnerOperation = LocalCredentialWriteOperation | 'verify' | 'login-form'

export type CredentialOwner =
  | { kind: 'local' }
  | {
      kind: 'external'
      issuer: string
      providerId: string
      accountUrl: string
      resetUrl: string
      loginHint?: string
      forwardResetRequest?: (email: string) => Promise<void>
    }
  | { kind: 'frozen'; reason: string }
  | { kind: 'none' }

export type CredentialOwnerKind = CredentialOwner['kind']
export type ExternalCredentialOwner = Extract<CredentialOwner, { kind: 'external' }>

export interface ResolveCredentialOwnerArgs {
  db: any
  operation: CredentialOwnerOperation
  user: any | null
  email: string | null
}

export type ResolveCredentialOwner = (args: ResolveCredentialOwnerArgs) => Promise<CredentialOwner> | CredentialOwner
