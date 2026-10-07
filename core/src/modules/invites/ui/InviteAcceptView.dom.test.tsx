/**
 * p131 INV-002 — the invite accept view. I5: no state renders a role, even
 * when the caller spreads a whole invite (incl. roleName) into the props.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InviteAcceptView, type InviteAcceptState, type InviteAcceptViewProps } from './index';

afterEach(() => cleanup());

const ROLE = 'Billing Overlord';
const ROLE_REF = 'role-ref-9137';

const STATES: InviteAcceptState[] = ['new-person', 'sign-in', 'join', 'wrong-account', 'ended', 'almost-there'];

function base(state: InviteAcceptState): InviteAcceptViewProps {
  return {
    state,
    brandName: 'Cadra',
    orgName: 'Acme Corp',
    inviterName: 'Ira Inviter',
    email: 'ana@example.com',
    token: 'tok_raw_123',
    signedInEmail: 'someone@else.com',
    endedReason: 'expired',
    onGoogle: vi.fn(),
    onUseDifferentAccount: vi.fn(),
  };
}

describe('InviteAcceptView', () => {
  it.each(STATES)('%s renders no role name (I5)', (state) => {
    // A caller spreading a whole invite row in — roleName/roleRef ride along.
    const props = { ...base(state), roleName: ROLE, roleRef: ROLE_REF } as unknown as InviteAcceptViewProps;
    const { container } = render(<InviteAcceptView {...props} />);
    expect(screen.getByTestId(`invite-state-${state}`)).toBeTruthy();
    const html = container.innerHTML;
    expect(container.textContent ?? '').not.toContain(ROLE);
    expect(html).not.toContain(ROLE);
    expect(html).not.toContain(ROLE_REF);
    expect((container.textContent ?? '').toLowerCase()).not.toContain('role');
  });

  it('new-person: password form posts the token, Google button calls onGoogle', () => {
    const p = base('new-person');
    const { container } = render(<InviteAcceptView {...p} />);
    expect(screen.getByText('Ira Inviter invited you to join Acme Corp')).toBeTruthy();
    expect(screen.getByText('Create your Cadra account to accept.')).toBeTruthy();
    const form = screen.getByTestId('invite-create-form');
    expect((form.querySelector('input[name="token"]') as HTMLInputElement).value).toBe('tok_raw_123');
    expect(container.querySelector('input[name="password"]')).toBeTruthy();
    fireEvent.click(screen.getByText('Continue with Google'));
    expect(p.onGoogle).toHaveBeenCalledOnce();
  });

  it('sign-in: email fixed, password + Google', () => {
    render(<InviteAcceptView {...base('sign-in')} />);
    expect(screen.getByTestId('invite-email').textContent).toBe('ana@example.com');
    expect(screen.getByText('Sign in and join')).toBeTruthy();
    expect(screen.getByText('Continue with Google')).toBeTruthy();
  });

  it('join: one Join <org> button, token hidden field, no password', () => {
    const { container } = render(<InviteAcceptView {...base('join')} />);
    expect(screen.getByText('Join Acme Corp')).toBeTruthy();
    expect(container.querySelector('input[name="password"]')).toBeNull();
    expect((container.querySelector('input[name="token"]') as HTMLInputElement).value).toBe('tok_raw_123');
  });

  it('wrong-account: names the invited email and offers a different account', () => {
    const p = base('wrong-account');
    render(<InviteAcceptView {...p} />);
    expect(screen.getByText('This invite is for ana@example.com')).toBeTruthy();
    expect(screen.getByText("You're signed in as someone@else.com.")).toBeTruthy();
    fireEvent.click(screen.getByText('Use a different account'));
    expect(p.onUseDifferentAccount).toHaveBeenCalledOnce();
  });

  it('ended: copy per reason, naming the inviter', () => {
    render(<InviteAcceptView {...base('ended')} />);
    expect(screen.getByTestId('invite-ended').textContent).toBe('This invite has expired. Ask Ira Inviter to send a new one.');
  });

  it('almost-there: Retry posts the token', () => {
    const { container } = render(<InviteAcceptView {...base('almost-there')} />);
    expect(screen.getByText('Almost there')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    expect((container.querySelector('input[name="token"]') as HTMLInputElement).value).toBe('tok_raw_123');
  });

  it('shows an error line when given one', () => {
    render(<InviteAcceptView {...base('sign-in')} error="Wrong password" />);
    expect(screen.getByRole('alert').textContent).toBe('Wrong password');
  });
});
