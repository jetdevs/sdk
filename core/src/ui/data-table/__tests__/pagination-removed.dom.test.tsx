/**
 * BaseListTable: a `pagination` config that goes away after first render
 * (e.g. the user picks a page size larger than the total, so the consumer
 * stops passing a pager) must render every row it is given.
 *
 * Regression (CAD-492): TanStack caches the pagination row model on the table
 * instance, so with `manualPagination` false the rows were sliced at TanStack's
 * default page size of 10 and the pager was gone.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBaseListTable } from '../BaseListTable';
import { baseUi, personColumns, type Person } from './_fixtures';
import { mockViewport } from './_viewport';

const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);

const PEOPLE_25: Person[] = Array.from({ length: 25 }, (_, i) => ({
  id: `u${i + 1}`,
  name: `Person ${i + 1}`,
  email: `p${i + 1}@example.com`,
}));

async function flush() {
  await act(async () => {});
}

afterEach(() => cleanup());

describe('BaseListTable pagination config removed after first render', () => {
  it('renders all rows, not TanStack default 10', async () => {
    mockViewport(1280);
    const pager = {
      pageIndex: 0,
      pageSize: 20,
      totalCount: 25,
      onPageChange: () => {},
      onPageSizeChange: () => {},
    };
    const { container, rerender } = render(
      <Base<Person> data={PEOPLE_25.slice(0, 20)} columns={personColumns} pagination={pager} />,
    );
    await flush();
    expect(container.textContent).toContain('Person 20');

    // User picks 50: consumer slices 0..50 and passes no pager.
    rerender(<Base<Person> data={PEOPLE_25} columns={personColumns} />);
    await flush();
    expect(container.textContent).toContain('Person 11');
    expect(container.textContent).toContain('Person 25');
  });
});
