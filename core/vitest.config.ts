import { defineConfig } from 'vitest/config';

/**
 * Vitest config for @jetdevs/core.
 *
 * The package historically had NO vitest config and NO DOM env — its only test
 * (`src/ui/data-table/__tests__/column-meta.test.ts`) is pure logic and runs in
 * the default `node` environment. The p6 Track-A data-table render tests need a
 * DOM, so we opt those files into `happy-dom` via `environmentMatchGlobs` WITHOUT
 * changing the global default (keeps the existing pure-logic test untouched).
 */
export default defineConfig({
  test: {
    // Default stays `node` so column-meta.test.ts behaves exactly as before.
    environment: 'node',
    environmentMatchGlobs: [
      // Only the data-table DOM render tests get happy-dom.
      ['src/ui/data-table/__tests__/*.dom.test.{ts,tsx}', 'happy-dom'],
    ],
    globals: true,
  },
});
