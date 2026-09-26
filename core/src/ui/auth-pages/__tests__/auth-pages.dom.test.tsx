/**
 * p79 STORY-047 — the shared auth page UI renders one design for every
 * brand: what differs between Cadra and Yobo is the app's CSS variables and
 * the brand node it passes, never the component.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuthCard,
  AuthLink,
  AuthMessage,
  AuthPrimaryButton,
  AuthShell,
  AuthTopBar,
  FloatingLabelInput,
  GoogleButton,
  IdentityRow,
  OrDivider,
  PasswordField,
  Wordmark,
} from '../index';

afterEach(() => cleanup());

/** A whole login step, as an app composes it. */
function LoginStepTwo({ brand }: { brand: React.ReactNode }) {
  const [password, setPassword] = React.useState('');
  return (
    <AuthShell topBar={<AuthTopBar brand={brand} />}>
      <AuthCard title="Sign In" footer={<AuthLink href="/forgot-password">Forgot password?</AuthLink>}>
        <form>
          <IdentityRow value="someone@example.com" changeLabel="Not you?" onChange={() => {}} />
          <PasswordField id="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <AuthPrimaryButton type="submit">Sign In</AuthPrimaryButton>
        </form>
        <OrDivider label="Or" />
        <GoogleButton type="button">Continue with Google</GoogleButton>
      </AuthCard>
    </AuthShell>
  );
}

describe('one design, two brands', () => {
  it('renders byte-identical chrome for a wordmark brand and a logo brand except the brand node itself', () => {
    const cadra = render(<LoginStepTwo brand={<Wordmark text="Cadra" accent="OS" />} />);
    const cadraHtml = cadra.container.innerHTML;
    const cadraBrand = cadra.container.querySelector('header a')!.innerHTML;
    cleanup();
    const yobo = render(<LoginStepTwo brand={<img src="/yobo-logo.png" alt="Yobo" />} />);
    const yoboHtml = yobo.container.innerHTML;
    const yoboBrand = yobo.container.querySelector('header a')!.innerHTML;

    expect(cadraHtml.replace(cadraBrand, '§BRAND§')).toBe(yoboHtml.replace(yoboBrand, '§BRAND§'));
    expect(cadraBrand).toContain('<span class="text-primary">OS</span>');
    expect(yoboBrand).toContain('alt="Yobo"');
  });

  it('uses only the app\'s theme tokens for colour: no hex, rgb or named colour class anywhere', () => {
    const { container } = render(<LoginStepTwo brand={<Wordmark text="Cadra" accent="OS" />} />);
    const classes = Array.from(container.querySelectorAll('[class]'))
      .map((el) => el.getAttribute('class') ?? '')
      .join(' ');
    // Tailwind palette colours (bg-blue-500 …) would pin a brand; token classes (bg-primary …) do not.
    expect(classes).not.toMatch(/\b(bg|text|border)-(red|blue|green|indigo|zinc|gray|slate|emerald|amber)-\d/);
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}/i);
    expect(container.querySelector('[style]')).toBeNull();
  });
});

describe('the pieces', () => {
  it('AuthCard: title, content and footer in cadra-web\'s card classes', () => {
    const { container } = render(
      <AuthCard title="Sign In" description="desc" footer={<span>foot</span>}>
        <span>body</span>
      </AuthCard>,
    );
    const card = container.firstElementChild!;
    expect(card.className).toBe('rounded-lg border bg-card text-card-foreground shadow-sm w-full max-w-md');
    expect(screen.getByRole('heading', { name: 'Sign In' }).tagName).toBe('H3');
    expect(screen.getByText('desc').className).toContain('text-muted-foreground');
    expect(screen.getByText('foot').parentElement!.className).toContain('p-6 pt-0');
  });

  it('FloatingLabelInput: the label is the in-field hint until focused or filled', () => {
    function Field() {
      const [v, setV] = React.useState('');
      return <FloatingLabelInput id="email" label="Email or Phone" value={v} onChange={(e) => setV(e.target.value)} placeholder="you@example.com" />;
    }
    render(<Field />);
    const input = screen.getByLabelText('Email or Phone') as HTMLInputElement;
    const label = document.querySelector('label[for="email"]')!;
    expect(label.className).toContain('top-1/2');
    expect(input.placeholder).toBe('');
    fireEvent.focus(input);
    expect(label.className).toContain('top-1.5');
    expect(input.placeholder).toBe('you@example.com');
    fireEvent.blur(input);
    expect(label.className).toContain('top-1/2');
    fireEvent.change(input, { target: { value: 'a@b.co' } });
    expect(label.className).toContain('top-1.5');
  });

  it('PasswordField: hidden by default, the toggle reveals, the field stays labelled', () => {
    function Field() {
      const [v, setV] = React.useState('secret');
      return <PasswordField id="pw" label="Password" value={v} onChange={(e) => setV(e.target.value)} />;
    }
    render(<Field />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.className).toContain('pr-10');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input.type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input.type).toBe('password');
  });

  it('IdentityRow: shows the identifier as text and the change control calls back', () => {
    const onChange = vi.fn();
    render(<IdentityRow value="a@b.co" changeLabel="Not you?" onChange={onChange} />);
    expect(screen.getByTestId('login-identifier').textContent).toBe('a@b.co');
    expect(document.querySelector('input')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Not you?' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('buttons: loading disables and shows a spinner; Google carries the mark; the divider centres its label', () => {
    const { rerender } = render(<AuthPrimaryButton>Continue</AuthPrimaryButton>);
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('w-full');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    rerender(<AuthPrimaryButton loading>Continue</AuthPrimaryButton>);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector('svg.animate-spin')).not.toBeNull();

    render(<GoogleButton>Continue with Google</GoogleButton>);
    const google = screen.getByRole('button', { name: 'Continue with Google' });
    expect(google.className).toContain('border-input');
    expect(google.querySelector('svg path[fill="#4285F4"]')).not.toBeNull();

    render(<OrDivider label="Or" />);
    expect(screen.getByText('Or').className).toContain('bg-card');
  });

  it('AuthMessage: error is an alert in destructive, status is a status in muted', () => {
    render(
      <>
        <AuthMessage>bad</AuthMessage>
        <AuthMessage tone="status">note</AuthMessage>
      </>,
    );
    expect(screen.getByRole('alert').className).toContain('text-destructive');
    expect(screen.getByRole('status').className).toContain('text-muted-foreground');
  });

  it('AuthTopBar / AuthLink: take the app\'s link component', () => {
    const FakeLink = ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
      <a data-router="1" href={href} {...rest}>
        {children}
      </a>
    );
    render(
      <>
        <AuthTopBar brand={<Wordmark text="Cadra" accent="OS" />} href="/home" linkComponent={FakeLink} />
        <AuthLink href="/x" component={FakeLink}>
          x
        </AuthLink>
      </>,
    );
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('data-router')).toBe('1');
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/home');
    expect(screen.getByRole('link', { name: 'x' }).getAttribute('data-router')).toBe('1');
  });
});

describe('AuthShell offsets by the header height the theme sets', () => {
  it('centres under the AppHeader height vars (48px phones / 64px md defaults), not a fixed 64px', () => {
    const { container } = render(
      <AuthShell topBar={<AuthTopBar brand={<Wordmark text="Cadra" accent="OS" />} />}>
        <p>card</p>
      </AuthShell>,
    );
    const body = container.querySelector('[data-slot="auth-shell-body"]')!;
    const cls = body.className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        'min-h-[calc(100dvh_-_var(--app-header-height-sm,3rem))]',
        'md:min-h-[calc(100dvh_-_var(--app-header-height,4rem))]',
      ]),
    );
    expect(body.className).not.toMatch(/64px|48px/);
    // Same vars the header itself is sized by — one theme knob moves both.
    const header = container.querySelector('header')!.className;
    expect(header).toContain('h-[var(--app-header-height-sm,3rem)]');
    expect(header).toContain('md:h-[var(--app-header-height,4rem)]');
    expect(body.textContent).toBe('card');
  });
});
