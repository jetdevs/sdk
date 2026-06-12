/**
 * One-shot baseline capture (Track A back-compat proof).
 *
 * Run with `npx tsx` against the UNMODIFIED factories BEFORE adding the renderRow
 * props, to snapshot the exact no-renderRow markup of each factory. The DOM test
 * then asserts the post-change render is byte-identical to these captured files.
 *
 *   npx tsx src/ui/data-table/__tests__/capture-baseline.tsx
 *
 * Outputs:
 *   __tests__/__baseline__/toolbar.no-renderrow.html
 *   __tests__/__baseline__/base.no-renderrow.html
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createBaseListTable } from '../BaseListTable';
import { PEOPLE, personColumns, toolbarUi, baseUi, type Person } from './_fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '__baseline__');
mkdirSync(outDir, { recursive: true });

const Toolbar = createDataTableWithToolbar<Person>({
  config: { entityName: 'people' },
  ui: toolbarUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});
const toolbarHtml = renderToStaticMarkup(
  React.createElement(Toolbar, { data: PEOPLE, columns: personColumns }),
);
writeFileSync(join(outDir, 'toolbar.no-renderrow.html'), toolbarHtml);

const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);
const baseHtml = renderToStaticMarkup(
  React.createElement(Base<Person>, { data: PEOPLE, columns: personColumns }),
);
writeFileSync(join(outDir, 'base.no-renderrow.html'), baseHtml);

// eslint-disable-next-line no-console
console.log('Captured baseline:\n  toolbar:', toolbarHtml.length, 'bytes\n  base:', baseHtml.length, 'bytes');
