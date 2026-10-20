/**
 * Invites module types (p131 INV-001). Connect-owned org invites: an invite
 * creates no account (I2); the account is created only on accept, on Connect.
 */

export type InviteStatus = 'pending' | 'accepted' | 'cancelled' | 'expired';
export type ProvisionState = 'none' | 'pending' | 'done' | 'refused';

/** A stored invite row (drizzle view of `org_invites`). */
export interface OrgInvite {
  id: number;
  orgId: number;
  email: string;
  roleRef: string;
  roleName: string;
  invitedBySub: string;
  invitedByName: string | null;
  clientId: string;
  sourceSystem: string;
  appUrl: string;
  tokenHash: string;
  accessCodeId: number | null;
  status: InviteStatus;
  expiresAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedUserId: number | null;
  cancelledAt: Date | null;
  provisionState: ProvisionState;
  provisionAttempts: number;
}

/** An invite as returned to callers — never carries the token hash. */
export type PublicInvite = Omit<OrgInvite, 'tokenHash'>;

/**
 * The authenticated caller (derived from the internal API key, never from the
 * request body — P21). Every list/resend/cancel matches on both fields.
 */
export interface InviteCaller {
  clientId: string;
  sourceSystem: string;
}

export interface ResolvedOrg {
  orgId: number;
  orgName: string;
}

/** Finds (or, when `create`, find-or-creates) the Connect org for a source org ref (P5). */
export type ResolveOrg = (
  db: unknown,
  input: { sourceSystem: string; sourceOrgRef: string; orgName?: string; create: boolean },
) => Promise<ResolvedOrg | null>;

/** Reverse of ResolveOrg (resend needs the org name + the access-code tag). */
export type DescribeOrg = (
  db: unknown,
  input: { orgId: number; sourceSystem: string },
) => Promise<{ sourceOrgRef: string; orgName: string } | null>;

/** Exactly the template variables of `<brand>-<env>-org-invite` (D4, I5 — no role). */
export interface InviteEmailVariables {
  org_name: string;
  inviter_name: string;
  accept_url: string;
  expires_at: string;
}

export type SendInviteEmail = (message: { to: string; variables: InviteEmailVariables }) => Promise<void>;

/** Optional p107 gate (P8). Shape matches `createAccessService().createCode/revokeCode`. */
export interface InviteAccessGate {
  createCode(
    db: never,
    input: {
      kind: 'single_use';
      boundEmail: string;
      maxUses: number;
      expiresAt: Date;
      tag: string;
    },
  ): Promise<{ id: number }>;
  revokeCode(db: never, codeId: number): Promise<unknown>;
}

export interface CreateInviteInput {
  sourceOrgRef: string;
  orgName: string;
  email: string;
  roleRef: string;
  roleName: string;
  invitedBySub: string;
  invitedByName?: string | null;
  appUrl: string;
}

export interface CreateInviteResult {
  invite: PublicInvite;
  /** The raw token — returned ONCE, never persisted or logged. */
  token: string;
  /** True when an open invite for the same email+org was superseded (P22). */
  superseded: boolean;
  /** False when the mail send failed after commit; the invite stays pending (P22). */
  emailSent: boolean;
  connectOrgId: number;
}

export type InviteLookup =
  | { status: 'not_found' }
  | { status: InviteStatus; invite: PublicInvite };
