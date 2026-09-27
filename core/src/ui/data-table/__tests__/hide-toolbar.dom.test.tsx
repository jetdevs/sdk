/**
 * BaseListTable `hideToolbar` — consumers with their own search/filter chrome
 * drop the built-in toolbar instead of hiding it with a DOM-position CSS hack
 * (`[&>div>div:first-child]:hidden`, cadra-web AgentsDataTable / ListTable).
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createBaseListTable } from '../BaseListTable';
import { PEOPLE, baseUi, personColumns, type Person } from './_fixtures';
import { mockViewport } from './_viewport';

const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);

const toolbarProps = {
  search: { value: '', onChange: () => {}, placeholder: 'Search people...' },
  statusFilter: { value: 'all', onChange: () => {}, options: [{ label: 'All', value: 'all' }] },
  onRefresh: () => {},
  resultLabel: '3 people',
  rightContent: <span data-testid="right">right</span>,
  primaryAction: <button type="button">New person</button>,
};

async function flush() {
  await act(async () => {});
}

afterEach(() => cleanup());

describe.each([
  ['desktop', 1280],
  ['phone', 390],
])('BaseListTable hideToolbar (%s)', (_label, width) => {
  it('renders the toolbar by default', async () => {
    mockViewport(width);
    const { container } = render(<Base<Person> data={PEOPLE} columns={personColumns} {...toolbarProps} />);
    await flush();
    expect(container.querySelector('input[placeholder="Search people..."]')).not.toBeNull();
    expect(container.textContent).toContain('New person');
  });

  it('renders no toolbar at all when hideToolbar, rows still render', async () => {
    mockViewport(width);
    const { container } = render(
      <Base<Person> data={PEOPLE} columns={personColumns} {...toolbarProps} hideToolbar />,
    );
    await flush();
    expect(container.querySelector('input')).toBeNull();
    expect(container.querySelector('[data-slot="list-toolbar-mobile"]')).toBeNull();
    expect(container.querySelector('[data-testid="right"]')).toBeNull();
    expect(container.textContent).not.toContain('New person');
    expect(container.textContent).not.toContain('3 people');
    expect(container.textContent).toContain('Alice');
    // The first child is now the list itself — nothing for a :first-child hack to hide.
    expect(container.firstElementChild!.firstElementChild!.querySelector('input')).toBeNull();
  });
});
