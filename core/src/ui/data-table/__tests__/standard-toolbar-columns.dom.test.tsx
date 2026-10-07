/**
 * p90 standard list toolbar — the Columns menu (hide, don't delete) and the
 * footer page-size select, on the toolbar itself and on both list factories.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaseListTable } from '../BaseListTable';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createStandardListToolbar } from '../standard-toolbar';
import { PEOPLE, baseUi, toolbarUi, type Person } from './_fixtures';
import { mockViewport } from './_viewport';

// Checkbox items that actually fire (the shared stub is inert).
const CheckboxItem = ({
  children,
  checked,
  onCheckedChange,
}: {
  children?: React.ReactNode;
  checked?: boolean;
  onCheckedChange?: (c: boolean) => void;
}) => (
  <div role="menuitemcheckbox" aria-checked={checked} onClick={() => onCheckedChange?.(!checked)}>
    {children}
  </div>
);

const Base = createBaseListTable({ ...baseUi, DropdownMenuCheckboxItem: CheckboxItem } as unknown as Parameters<
  typeof createBaseListTable
>[0]);
const Toolbar = createStandardListToolbar({
  ...(baseUi as unknown as Parameters<typeof createStandardListToolbar>[0]),
  DropdownMenuCheckboxItem: CheckboxItem,
});

// name + email are fields; `org_count` is labelled via meta; `actions` is a
// display column (no accessor, no label) and must never be offered.
const columns: ColumnDef<Person, unknown>[] = [
  { accessorKey: 'name', header: 'Name', cell: (c) => c.getValue() as string },
  { accessorKey: 'email', header: 'Email', cell: (c) => c.getValue() as string },
  { id: 'org_count', meta: { label: 'Organizations' }, header: 'Orgs', cell: () => 'ORGCELL' },
  { id: 'actions', header: '', cell: () => 'ACTCELL' },
];

async function flush() {
  await act(async () => {});
}

const menu = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[role="menuitemcheckbox"]')).map((el) => [
    el.textContent,
    el.getAttribute('aria-checked'),
  ]);

afterEach(() => cleanup());

describe('StandardListToolbar columns', () => {
  it('draws a quiet Columns button + menu and toggles through onToggle', async () => {
    mockViewport(1280);
    const onToggle = vi.fn();
    const { container, getByLabelText } = render(
      <Toolbar
        search={{ value: '', onChange: () => {} }}
        columns={[
          { id: 'name', label: 'Name', visible: true, onToggle: () => {} },
          { id: 'trial', label: 'Trial end', visible: false, onToggle },
        ]}
        columnsLabel="Show columns"
        testId="subs"
      />,
    );
    await flush();
    const btn = container.querySelector('[data-testid="subs-columns"]')!;
    expect(btn).not.toBeNull();
    expect(getByLabelText('Show columns')).toBe(btn);
    // Theme tokens only, no badge/count.
    expect(btn.className).toContain('text-muted-foreground');
    expect(btn.className).not.toMatch(/bg-(primary|blue|red|green)/);
    expect(menu(container)).toEqual([
      ['Name', 'true'],
      ['Trial end', 'false'],
    ]);
    fireEvent.click(within(container).getByText('Trial end'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('is icon-only on phones and sits in the search row', async () => {
    mockViewport(390);
    const { container } = render(
      <Toolbar
        search={{ value: '', onChange: () => {} }}
        columns={[{ id: 'a', label: 'A', visible: true, onToggle: () => {} }]}
      />,
    );
    await flush();
    const btn = container.querySelector('[data-testid="list-columns"]')!;
    // Fixed 36px square below md; the word only from md up.
    expect(btn.className).toMatch(/\bh-9\b/);
    expect(btn.className).toMatch(/\bw-9\b/);
    expect(btn.className).toContain('shrink-0');
    expect(btn.querySelector('span')!.className).toBe('hidden md:inline');
    const search = container.querySelector('[data-testid="list-search"]')!;
    expect(search.parentElement!.contains(btn)).toBe(true);
  });

  it('renders nothing for empty or disabled columns', async () => {
    const { container, rerender } = render(<Toolbar search={{ value: '', onChange: () => {} }} columns={[]} />);
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).toBeNull();
    rerender(<Toolbar search={{ value: '', onChange: () => {} }} columns={false} />);
    expect(container.querySelector('[data-testid="list-columns"]')).toBeNull();
  });

  it('draws the toolbar with only a Columns menu', async () => {
    const { container } = render(
      <Toolbar columns={[{ id: 'a', label: 'A', visible: true, onToggle: () => {} }]} />,
    );
    await flush();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).not.toBeNull();
  });
});

describe('BaseListTable standardToolbar columns', () => {
  it('offers hideable fields (not actions) and brings a hidden-by-default column back', async () => {
    mockViewport(1280);
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={columns}
        defaultVisibleColumns={['name', 'email', 'actions']}
        standardToolbar={{ search: { value: '', onChange: () => {} } }}
      />,
    );
    await flush();
    expect(menu(container)).toEqual([
      ['Name', 'true'],
      ['Email', 'true'],
      ['Organizations', 'false'],
    ]);
    expect(container.textContent).not.toContain('ORGCELL');
    expect(container.textContent).toContain('ACTCELL');

    fireEvent.click(within(container).getByText('Organizations', { selector: '[role="menuitemcheckbox"]' }));
    await flush();
    expect(container.textContent).toContain('ORGCELL');

    fireEvent.click(within(container).getByText('Email', { selector: '[role="menuitemcheckbox"]' }));
    await flush();
    expect(container.textContent).not.toContain('alice@example.com');
  });

  it('hides the menu when enableColumnVisibility is false or columns: false', async () => {
    mockViewport(1280);
    const { container, rerender } = render(
      <Base<Person> data={PEOPLE} columns={columns} enableColumnVisibility={false} standardToolbar={{}} />,
    );
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).toBeNull();
    rerender(<Base<Person> data={PEOPLE} columns={columns} standardToolbar={{ columns: false }} />);
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).toBeNull();
  });

  it('keeps the footer page-size select', async () => {
    mockViewport(1280);
    const onPageSizeChange = vi.fn();
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={columns}
        pagination={{ pageIndex: 0, pageSize: 20, totalCount: 30, onPageChange: () => {}, onPageSizeChange }}
        standardToolbar={{}}
      />,
    );
    await flush();
    const select = container.querySelector('select')!;
    expect(select).not.toBeNull();
    fireEvent.change(select, { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });

  it('shows the icon-only menu on phones too (cards follow column visibility)', async () => {
    mockViewport(390);
    const { container } = render(<Base<Person> data={PEOPLE} columns={columns} standardToolbar={{}} />);
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).not.toBeNull();
  });
});

describe('DataTableWithToolbar standardToolbar columns', () => {
  const make = (enableColumnVisibility?: boolean) =>
    createDataTableWithToolbar<Person>({
      config: { entityName: 'people', enableColumnVisibility, initialColumnVisibility: { org_count: false } },
      ui: { ...toolbarUi, DropdownMenuCheckboxItem: CheckboxItem } as unknown as Parameters<
        typeof createDataTableWithToolbar<Person>
      >[0]['ui'],
    });

  it('draws the Columns menu from the table and keeps Rows per page', async () => {
    mockViewport(1280);
    const Dt = make();
    const { container } = render(
      <Dt data={PEOPLE} columns={columns} standardToolbar={{}} />,
    );
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).not.toBeNull();
    expect(menu(container)).toEqual([
      ['Name', 'true'],
      ['Email', 'true'],
      ['Organizations', 'false'],
    ]);
    expect(container.textContent).toContain('Rows per page');
    fireEvent.click(within(container).getByText('Organizations', { selector: '[role="menuitemcheckbox"]' }));
    await flush();
    expect(container.textContent).toContain('ORGCELL');
  });

  it('no Columns menu when the config turns column visibility off', async () => {
    mockViewport(1280);
    const Dt = make(false);
    const { container } = render(<Dt data={PEOPLE} columns={columns} standardToolbar={{}} />);
    await flush();
    expect(container.querySelector('[data-testid="list-columns"]')).toBeNull();
  });
});
