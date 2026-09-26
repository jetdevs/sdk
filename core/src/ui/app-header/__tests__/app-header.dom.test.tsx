/**
 * p90 batch 3d — ONE app header + ONE brand mark for every app.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AppHeader, BrandLockup, BrandMark, CadraMark, Wordmark, cadraBrand, isExternalHref, type BrandConfig } from '../index';
import { AuthTopBar, Wordmark as AuthWordmark } from '../../auth-pages';

afterEach(() => cleanup());

const yoboBrand: BrandConfig = { name: 'Yobo', markSrc: '/yobo-logo-black.png', markSrcDark: '/yobo-logo.png' };

/** A stand-in for next/link, to prove the app's router link is used. */
const FakeLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  function FakeLink(props, ref) {
    return <a ref={ref} data-router-link="" {...props} />;
  },
);

describe('CadraMark / BrandMark', () => {
  it('gives each CadraMark its own gradient id', () => {
    const { container } = render(
      <>
        <CadraMark />
        <CadraMark />
      </>,
    );
    const ids = Array.from(container.querySelectorAll('linearGradient')).map((g) => g.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('is decorative without a title and an img with one', () => {
    const { container } = render(<CadraMark />);
    expect(container.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    cleanup();
    render(<CadraMark title="CadraOS" />);
    expect(screen.getByRole('img', { name: 'CadraOS' })).toBeTruthy();
  });

  it('renders a light + dark image pair for an image brand', () => {
    render(<BrandMark markSrc="/a.png" markSrcDark="/b.png" alt="Yobo" />);
    const light = screen.getByTestId('brand-mark-img');
    const dark = screen.getByTestId('brand-mark-img-dark');
    expect(light.getAttribute('src')).toBe('/a.png');
    expect(light.className).toContain('dark:hidden');
    expect(dark.getAttribute('src')).toBe('/b.png');
    expect(dark.className).toContain('dark:block');
  });

  it('renders one image when there is no distinct dark variant, and nothing when there is no mark', () => {
    const { container } = render(<BrandMark markSrc="/a.png" />);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    cleanup();
    const empty = render(<BrandMark />);
    expect(empty.container.innerHTML).toBe('');
  });
});

describe('BrandLockup', () => {
  it('draws the Cadra mark + "Cadra" + "OS" in text-primary', () => {
    const { container } = render(<BrandLockup {...cadraBrand} />);
    expect(screen.getByTestId('cadra-mark')).toBeTruthy();
    expect(container.textContent).toBe('CadraOS');
    expect(container.innerHTML).toContain('<span class="text-primary">OS</span>');
  });

  it('uses a logo image alone, alt = brand name, for a brand with no wordmark (Yobo)', () => {
    render(<BrandLockup {...yoboBrand} />);
    const imgs = screen.getAllByAltText('Yobo');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/yobo-logo-black.png', '/yobo-logo.png']);
  });

  it('labels a mark-only node brand for screen readers', () => {
    const { container } = render(<BrandLockup name="Acme" mark={<svg data-testid="acme" />} />);
    expect(container.querySelector('.sr-only')!.textContent).toBe('Acme');
  });

  it('applies markClassName to the mark', () => {
    render(<BrandLockup {...cadraBrand} markClassName="h-7 w-7" />);
    const cls = screen.getByTestId('cadra-mark').getAttribute('class')!;
    expect(cls).toContain('h-7');
    expect(cls).not.toContain('h-8');
  });

  it('is the same Wordmark the auth pages export', () => {
    expect(AuthWordmark).toBe(Wordmark);
  });
});

describe('AppHeader', () => {
  it('renders the brand lockup linking to logoHref through the app router link', () => {
    render(<AppHeader brand={cadraBrand} logoHref="/dashboard" linkComponent={FakeLink} />);
    const link = screen.getByRole('link', { name: `${cadraBrand.name} home` });
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.hasAttribute('data-router-link')).toBe(true);
    expect(within(link).getByTestId('brand-lockup')).toBeTruthy();
  });

  it('defaults the link to brand.href, then "/"', () => {
    render(<AppHeader brand={{ ...cadraBrand, href: '/apps' }} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/apps');
    cleanup();
    render(<AppHeader brand={cadraBrand} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
  });

  it('never routes an absolute URL through the router link', () => {
    render(<AppHeader brand={cadraBrand} logoHref="https://cadraos.com" linkComponent={FakeLink} logoLabel="CadraOS home" />);
    const link = screen.getByRole('link', { name: 'CadraOS home' });
    expect(link.getAttribute('href')).toBe('https://cadraos.com');
    expect(link.hasAttribute('data-router-link')).toBe(false);
    expect(isExternalHref('http://x.y')).toBe(true);
    expect(isExternalHref('/dashboard')).toBe(false);
  });

  it('lets `logo` replace the lockup, and `logo={null}` show no brand at all', () => {
    render(<AppHeader brand={cadraBrand} logo={<img src="/org.png" alt="Org" />} />);
    expect(screen.getByAltText('Org')).toBeTruthy();
    expect(screen.queryByTestId('brand-lockup')).toBeNull();
    cleanup();
    render(<AppHeader brand={cadraBrand} logo={null} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders menu, nav and right slots in order: menu, brand, nav, spacer, right', () => {
    render(
      <AppHeader
        brand={cadraBrand}
        menu={<button>Menu</button>}
        nav={<a href="/apps">Back to your apps</a>}
        right={
          <>
            <span>Credits</span>
            <button>Sign out</button>
          </>
        }
      />,
    );
    const header = screen.getByTestId('app-header');
    const slots = Array.from(header.children).map((el) => el.getAttribute('data-slot') ?? 'spacer');
    expect(slots).toEqual(['menu', 'brand', 'nav', 'spacer', 'right']);
    expect(within(header.querySelector('[data-slot="right"]') as HTMLElement).getByText('Sign out')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to your apps' })).toBeTruthy();
  });

  it('omits empty slots', () => {
    render(<AppHeader brand={cadraBrand} />);
    const header = screen.getByTestId('app-header');
    expect(header.querySelector('[data-slot="menu"]')).toBeNull();
    expect(header.querySelector('[data-slot="nav"]')).toBeNull();
    expect(header.querySelector('[data-slot="right"]')).toBeNull();
  });

  it('is 48px on phones and 64px from md up, with the menu trigger phone-only', () => {
    render(<AppHeader brand={cadraBrand} menu={<button>Menu</button>} />);
    const header = screen.getByTestId('app-header');
    const cls = header.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['h-12', 'px-3', 'gap-2', 'md:h-16', 'md:px-6', 'md:gap-4', 'sticky', 'top-0', 'border-b', 'bg-background']));
    expect(header.querySelector('[data-slot="menu"]')!.className).toContain('md:hidden');
    // Mark: 28px phone, 32px desktop.
    const mark = screen.getByTestId('cadra-mark').getAttribute('class')!.split(/\s+/);
    expect(mark).toEqual(expect.arrayContaining(['h-7', 'w-7', 'md:h-8', 'md:w-8']));
  });

  it('keeps image marks at auto width at both sizes', () => {
    render(<AppHeader brand={yoboBrand} />);
    const img = screen.getByTestId('brand-mark-img').className.split(/\s+/);
    expect(img).toEqual(expect.arrayContaining(['h-7', 'md:h-8', 'w-auto']));
    expect(img).not.toContain('w-7');
  });

  it('uses theme tokens only — no palette colours or hex in the chrome', () => {
    const { container } = render(
      <AppHeader brand={yoboBrand} menu={<button>Menu</button>} nav={<span>Back office</span>} right={<span>x</span>} />,
    );
    const classes = Array.from(container.querySelectorAll('[class]'))
      .map((el) => el.getAttribute('class'))
      .join(' ');
    expect(classes).not.toMatch(/\b(?:bg|text|border)-(?:gray|slate|zinc|blue|indigo|purple|violet|white|black)\b/);
    expect(classes).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('AuthTopBar is the AppHeader', () => {
  it('renders the shared header, 48px on phones like the app, with children on the right', () => {
    render(
      <AuthTopBar brand={<Wordmark text="Cadra" accent="OS" />} href="/" aria-label="Go home">
        <button>Help</button>
      </AuthTopBar>,
    );
    const header = screen.getByTestId('app-header');
    const cls = header.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['h-12', 'md:h-16', 'px-4', 'gap-4', 'md:px-6']));
    expect(cls).not.toContain('h-16');
    expect(cls).not.toContain('px-3');
    expect(screen.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/');
    expect(within(header.querySelector('[data-slot="right"]') as HTMLElement).getByText('Help')).toBeTruthy();
  });
});
