/**
 * p90 batch 3d — ONE app header + ONE brand mark for every app.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import * as appHeader from '../index';
import { APP_HEADER_CSS_VARS, AppHeader, BrandLockup, BrandMark, Wordmark, isExternalHref, type BrandConfig } from '../index';
import { AuthTopBar, Wordmark as AuthWordmark } from '../../auth-pages';

afterEach(() => cleanup());

// Test-only brands. Core ships no product brand; each app defines its own.
const textBrand: BrandConfig = { name: 'Acme HQ', text: 'Acme', accent: 'HQ' };
const imageBrand: BrandConfig = { name: 'Logo Co', markSrc: '/logo-light.png', markSrcDark: '/logo-dark.png' };

/** A stand-in app mark component, the way an app passes its own SVG. */
function TestMark({ className }: { className?: string }) {
  return <svg className={className} data-testid="test-mark" />;
}

/** A stand-in for next/link, to prove the app's router link is used. */
const FakeLink = React.forwardRef<HTMLAnchorElement, React.AnchorHTMLAttributes<HTMLAnchorElement>>(
  function FakeLink(props, ref) {
    return <a ref={ref} data-router-link="" {...props} />;
  },
);

describe('core ships no product brand', () => {
  it('exports no brand constant or logo component — apps define their own', () => {
    const names = Object.keys(appHeader);
    expect(names.filter((n) => /cadra|yobo/i.test(n))).toEqual([]);
    expect(names.sort()).toEqual(
      ['APP_HEADER_CSS_VARS', 'AppHeader', 'BrandLockup', 'BrandMark', 'Wordmark', 'isExternalHref'].sort(),
    );
  });
});

describe('BrandMark', () => {
  it('renders a light + dark image pair for an image brand', () => {
    render(<BrandMark markSrc="/a.png" markSrcDark="/b.png" alt="Logo Co" />);
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
  it('draws a wordmark-only brand — text + accent in text-primary, no mark', () => {
    const { container } = render(<BrandLockup {...textBrand} />);
    expect(container.querySelector('svg, img')).toBeNull();
    expect(container.textContent).toBe('AcmeHQ');
    expect(container.innerHTML).toContain('<span class="text-primary">HQ</span>');
  });

  it('uses a logo image alone, alt = brand name, for a brand with no wordmark', () => {
    render(<BrandLockup {...imageBrand} />);
    const imgs = screen.getAllByAltText('Logo Co');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual(['/logo-light.png', '/logo-dark.png']);
  });

  it('labels a mark-only node brand for screen readers', () => {
    const { container } = render(<BrandLockup name="Acme" mark={<svg data-testid="acme" />} />);
    expect(container.querySelector('.sr-only')!.textContent).toBe('Acme');
  });

  it('applies markClassName to the mark', () => {
    render(<BrandLockup {...textBrand} mark={<TestMark />} markClassName="h-7 w-7" />);
    const cls = screen.getByTestId('test-mark').getAttribute('class')!;
    expect(cls).toContain('h-7');
    expect(cls).not.toContain('h-8');
  });

  it('is the same Wordmark the auth pages export', () => {
    expect(AuthWordmark).toBe(Wordmark);
  });
});

describe('AppHeader', () => {
  it('renders the brand lockup linking to logoHref through the app router link', () => {
    render(<AppHeader brand={textBrand} logoHref="/dashboard" linkComponent={FakeLink} />);
    const link = screen.getByRole('link', { name: `${textBrand.name} home` });
    expect(link.getAttribute('href')).toBe('/dashboard');
    expect(link.hasAttribute('data-router-link')).toBe(true);
    expect(within(link).getByTestId('brand-lockup')).toBeTruthy();
  });

  it('defaults the link to brand.href, then "/"', () => {
    render(<AppHeader brand={{ ...textBrand, href: '/apps' }} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/apps');
    cleanup();
    render(<AppHeader brand={textBrand} />);
    expect(screen.getByRole('link').getAttribute('href')).toBe('/');
  });

  it('never routes an absolute URL through the router link', () => {
    render(<AppHeader brand={textBrand} logoHref="https://acme.example" linkComponent={FakeLink} logoLabel="Acme home" />);
    const link = screen.getByRole('link', { name: 'Acme home' });
    expect(link.getAttribute('href')).toBe('https://acme.example');
    expect(link.hasAttribute('data-router-link')).toBe(false);
    expect(isExternalHref('http://x.y')).toBe(true);
    expect(isExternalHref('/dashboard')).toBe(false);
  });

  it('lets `logo` replace the lockup, and `logo={null}` show no brand at all', () => {
    render(<AppHeader brand={textBrand} logo={<img src="/org.png" alt="Org" />} />);
    expect(screen.getByAltText('Org')).toBeTruthy();
    expect(screen.queryByTestId('brand-lockup')).toBeNull();
    cleanup();
    render(<AppHeader brand={textBrand} logo={null} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('renders menu, nav and right slots in order: menu, brand, nav, spacer, right', () => {
    render(
      <AppHeader
        brand={textBrand}
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
    render(<AppHeader brand={textBrand} />);
    const header = screen.getByTestId('app-header');
    expect(header.querySelector('[data-slot="menu"]')).toBeNull();
    expect(header.querySelector('[data-slot="nav"]')).toBeNull();
    expect(header.querySelector('[data-slot="right"]')).toBeNull();
  });

  it('is 48px on phones and 64px from md up, with the menu trigger phone-only', () => {
    render(<AppHeader brand={textBrand} menu={<button>Menu</button>} />);
    const header = screen.getByTestId('app-header');
    const cls = header.className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        'h-[var(--app-header-height-sm,3rem)]',
        'px-[var(--app-header-px-sm,0.75rem)]',
        'gap-2',
        'md:h-[var(--app-header-height,4rem)]',
        'md:px-[var(--app-header-px,1.5rem)]',
        'md:gap-4',
        'sticky',
        'top-0',
        'border-b',
        'bg-background',
      ]),
    );
    expect(header.querySelector('[data-slot="menu"]')!.className).toContain('md:hidden');
    // Wordmark-only brand: no mark rendered.
    expect(header.querySelector('[data-slot="brand"] svg, [data-slot="brand"] img')).toBeNull();
  });

  it('reads height and gutter from theme variables, never hard-coded sizes (#16)', () => {
    render(<AppHeader brand={textBrand} />);
    const cls = screen.getByTestId('app-header').className.split(/\s+/);
    // No fixed Tailwind size/gutter steps — the theme owns them.
    for (const fixed of ['h-12', 'h-16', 'md:h-16', 'px-3', 'md:px-6']) expect(cls).not.toContain(fixed);
    // Every var the class string reads is a documented, exported name.
    const used = new Set(Array.from(cls.join(' ').matchAll(/var\((--[\w-]+)/g), (m) => m[1]));
    expect([...used].sort()).toEqual(Object.values(APP_HEADER_CSS_VARS).sort());
  });

  it('keeps image marks at auto width at both sizes', () => {
    render(<AppHeader brand={imageBrand} />);
    const img = screen.getByTestId('brand-mark-img').className.split(/\s+/);
    expect(img).toEqual(expect.arrayContaining(['h-7', 'md:h-8', 'w-auto']));
    expect(img).not.toContain('w-7');
  });

  it('uses theme tokens only — no palette colours or hex in the chrome', () => {
    const { container } = render(
      <AppHeader brand={imageBrand} menu={<button>Menu</button>} nav={<span>Back office</span>} right={<span>x</span>} />,
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
      <AuthTopBar brand={<Wordmark text="Acme" accent="HQ" />} href="/" aria-label="Go home">
        <button>Help</button>
      </AuthTopBar>,
    );
    const header = screen.getByTestId('app-header');
    const cls = header.className.split(/\s+/);
    expect(cls).toEqual(
      expect.arrayContaining([
        'h-[var(--app-header-height-sm,3rem)]',
        'md:h-[var(--app-header-height,4rem)]',
        'px-4',
        'gap-4',
        'md:px-[var(--app-header-px,1.5rem)]',
      ]),
    );
    expect(cls).not.toContain('h-16');
    expect(cls).not.toContain('px-[var(--app-header-px-sm,0.75rem)]');
    expect(screen.getByRole('link', { name: 'Go home' }).getAttribute('href')).toBe('/');
    expect(within(header.querySelector('[data-slot="right"]') as HTMLElement).getByText('Help')).toBeTruthy();
  });
});
