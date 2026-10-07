'use client';
/**
 * The Connect invite accept page, presentational only (p131 INV-002, specs D3,
 * D5, implementation.md P10–P13, P20). Each IdP mounts it on
 * `/invite/[token]` and supplies brand, data and actions; the view knows no
 * routing, session or data source.
 *
 * States:
 *   new-person   — no account for the invited email: password form + Google
 *   sign-in      — an account exists: password (invite-scoped, P11) + Google
 *   join         — signed in as the invitee: one "Join <org>" button
 *   wrong-account— signed in as someone else (P12)
 *   ended        — accepted / cancelled / expired / refused
 *   almost-there — accepted but app provisioning not confirmed yet: Retry (P13)
 *
 * I5: the role is never shown. The props carry no role, and the view renders
 * none even when a caller spreads a whole invite (incl. `roleName`) into it.
 * P20: every form posts the raw token as a hidden field — the token is the
 * only proof of mailbox possession.
 */
import * as React from 'react';

import {
  AuthCard,
  AuthMessage,
  AuthPrimaryButton,
  AuthSecondaryButton,
  AuthShell,
  GoogleButton,
  OrDivider,
  PasswordField,
} from '../../../ui/auth-pages';

export type InviteAcceptState = 'new-person' | 'sign-in' | 'join' | 'wrong-account' | 'ended' | 'almost-there';

type FormAction = React.FormHTMLAttributes<HTMLFormElement>['action'];

export interface InviteAcceptViewProps {
  state: InviteAcceptState;
  /** The IdP's brand name (text). */
  brandName: string;
  /** Optional brand node for the top bar (a wordmark); text brandName is used otherwise. */
  brand?: React.ReactNode;
  orgName: string;
  /** Who sent the invite; omitted → "You've been invited". */
  inviterName?: string | null;
  /** The invited email (fixed, never editable). */
  email: string;
  /** Raw invite token — posted as a hidden field by every form (P20). */
  token: string;
  /** new-person: create account + accept. Fields: token, name, password. */
  createAccountAction?: FormAction;
  /** sign-in: verify password (invite-scoped) + accept. Fields: token, password. */
  signInAction?: FormAction;
  /** join: accept as the signed-in invitee. Field: token. */
  joinAction?: FormAction;
  /** almost-there: retry provisioning. Field: token. */
  retryAction?: FormAction;
  /** new-person / sign-in: start Google (the IdP sets the invite cookie first, P10). */
  onGoogle?: () => void;
  /** wrong-account: the email the current session is signed in as. */
  signedInEmail?: string | null;
  /** wrong-account: sign out of Connect then log in as the invitee (P12). */
  onUseDifferentAccount?: () => void;
  /** ended: why the invite ended (copy chooses the sentence). */
  endedReason?: 'accepted' | 'cancelled' | 'expired' | 'refused' | 'not_found';
  /** A refusal message for the current state (bad password, Google mismatch…). */
  error?: string | null;
  /** Disables the actions while a submit is in flight. */
  pending?: boolean;
}

function Hidden({ token }: { token: string }) {
  return <input type="hidden" name="token" value={token} />;
}

function invitedLine(inviterName: string | null | undefined, orgName: string) {
  return inviterName ? `${inviterName} invited you to join ${orgName}` : `You've been invited to join ${orgName}`;
}

function endedCopy(reason: InviteAcceptViewProps['endedReason'], inviterName?: string | null): string {
  const ask = inviterName ? `Ask ${inviterName} to send a new one.` : 'Ask the person who invited you to send a new one.';
  switch (reason) {
    case 'accepted':
      return 'This invite has already been used.';
    case 'cancelled':
      return `This invite was cancelled. ${ask}`;
    case 'expired':
      return `This invite has expired. ${ask}`;
    case 'refused':
      return inviterName
        ? `We couldn't add you to this organization. Contact ${inviterName}.`
        : "We couldn't add you to this organization. Contact the person who invited you.";
    default:
      return 'This invite link is not valid.';
  }
}

export function InviteAcceptView(props: InviteAcceptViewProps) {
  const {
    state,
    brandName,
    brand,
    orgName,
    inviterName,
    email,
    token,
    error,
    pending,
  } = props;

  const topBar = (
    <div className="flex h-16 items-center px-6 text-lg font-semibold" data-testid="invite-brand">
      {brand ?? brandName}
    </div>
  );

  const errorLine = error ? <AuthMessage tone="error">{error}</AuthMessage> : null;
  const emailLine = (
    <p className="text-center text-sm text-muted-foreground" data-testid="invite-email">
      {email}
    </p>
  );

  let body: React.ReactNode;
  switch (state) {
    case 'new-person':
      body = (
        <AuthCard title={invitedLine(inviterName, orgName)} description={`Create your ${brandName} account to accept.`}>
          {emailLine}
          {errorLine}
          <form action={props.createAccountAction} method="post" className="space-y-4" data-testid="invite-create-form">
            <Hidden token={token} />
            <input type="hidden" name="email" value={email} readOnly />
            <PasswordField label="Choose a password" name="password" autoComplete="new-password" required disabled={pending} />
            <AuthPrimaryButton type="submit" loading={pending}>
              Create account and join
            </AuthPrimaryButton>
          </form>
          {props.onGoogle && (
            <>
              <OrDivider label="Or" />
              <GoogleButton type="button" onClick={props.onGoogle} disabled={pending}>
                Continue with Google
              </GoogleButton>
            </>
          )}
        </AuthCard>
      );
      break;
    case 'sign-in':
      body = (
        <AuthCard title={invitedLine(inviterName, orgName)} description={`Sign in to your ${brandName} account to accept.`}>
          {emailLine}
          {errorLine}
          <form action={props.signInAction} method="post" className="space-y-4" data-testid="invite-signin-form">
            <Hidden token={token} />
            <PasswordField label="Password" name="password" autoComplete="current-password" required disabled={pending} />
            <AuthPrimaryButton type="submit" loading={pending}>
              Sign in and join
            </AuthPrimaryButton>
          </form>
          {props.onGoogle && (
            <>
              <OrDivider label="Or" />
              <GoogleButton type="button" onClick={props.onGoogle} disabled={pending}>
                Continue with Google
              </GoogleButton>
            </>
          )}
        </AuthCard>
      );
      break;
    case 'join':
      body = (
        <AuthCard title={invitedLine(inviterName, orgName)} description={`Signed in as ${email}`}>
          {errorLine}
          <form action={props.joinAction} method="post" data-testid="invite-join-form">
            <Hidden token={token} />
            <AuthPrimaryButton type="submit" loading={pending}>
              {`Join ${orgName}`}
            </AuthPrimaryButton>
          </form>
        </AuthCard>
      );
      break;
    case 'wrong-account':
      body = (
        <AuthCard
          title={`This invite is for ${email}`}
          description={
            props.signedInEmail ? `You're signed in as ${props.signedInEmail}.` : "You're signed in with a different account."
          }
        >
          {errorLine}
          <AuthPrimaryButton type="button" onClick={props.onUseDifferentAccount} disabled={pending}>
            Use a different account
          </AuthPrimaryButton>
        </AuthCard>
      );
      break;
    case 'ended':
      body = (
        <AuthCard title="This invite can't be used">
          <AuthMessage tone="status" data-testid="invite-ended">
            {endedCopy(props.endedReason, inviterName)}
          </AuthMessage>
        </AuthCard>
      );
      break;
    case 'almost-there':
      body = (
        <AuthCard title="Almost there" description={`You've joined ${orgName}. We're finishing setting up your access.`}>
          {errorLine}
          <form action={props.retryAction} method="post" data-testid="invite-retry-form">
            <Hidden token={token} />
            <AuthSecondaryButton type="submit" loading={pending}>
              Retry
            </AuthSecondaryButton>
          </form>
        </AuthCard>
      );
      break;
  }

  return (
    <AuthShell topBar={topBar}>
      <div data-testid={`invite-state-${state}`} className="flex w-full justify-center">
        {body}
      </div>
    </AuthShell>
  );
}
