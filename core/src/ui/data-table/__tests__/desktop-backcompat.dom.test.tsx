/**
 * p90 — desktop rendering is byte-for-byte unchanged by the mobile card mode.
 *
 * Baselines in `__baseline__/desktop.<scenario>.{ssr,dom}.html` were captured
 * from the code BEFORE p90 (run once with `CAPTURE_DESKTOP_BASELINE=1`).
 *   - `.ssr`: `renderToStaticMarkup` (no window → desktop by definition)
 *   - `.dom`: client render in happy-dom with `matchMedia` reporting a desktop
 *     viewport, AFTER effects — proves the media-query hook resolves to the
 *     table path and adds nothing to the markup.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { desktopScenarios } from './_desktop-scenarios';
import { mockViewport } from './_viewport';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(__dirname, '__baseline__');
const CAPTURE = process.env.CAPTURE_DESKTOP_BASELINE === '1';

beforeEach(() => mockViewport(1280));
afterEach(() => cleanup());

describe('desktop render is byte-identical to the pre-p90 baseline', () => {
  for (const scenario of desktopScenarios) {
    it(`${scenario.name} (server render)`, () => {
      const html = renderToStaticMarkup(scenario.element());
      const file = join(baselineDir, `desktop.${scenario.name}.ssr.html`);
      if (CAPTURE) writeFileSync(file, html);
      expect(existsSync(file)).toBe(true);
      expect(html).toBe(readFileSync(file, 'utf-8'));
    });

    it(`${scenario.name} (client render, desktop viewport)`, async () => {
      const { container } = render(scenario.element());
      await act(async () => {});
      const html = container.innerHTML;
      const file = join(baselineDir, `desktop.${scenario.name}.dom.html`);
      if (CAPTURE) writeFileSync(file, html);
      expect(existsSync(file)).toBe(true);
      expect(html).toBe(readFileSync(file, 'utf-8'));
    });
  }
});
