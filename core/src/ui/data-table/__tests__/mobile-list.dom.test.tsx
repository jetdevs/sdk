/**
 * p90 — phone layout for BaseListTable / DataTableWithToolbar.
 *
 * Sean, on an iPhone: "List pages require user to slide left and right." Below
 * `md` the lists must render divider-separated rows (title + ONE status line +
 * ⋯), never a wide table; the toolbar collapses to search + one filters button;
 * the empty state spans the full width; and an empty list shows no pager.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBaseListTable } from '../BaseListTable';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createDataTablePagination } from '../DataTablePagination';
import { getCoreRowModel, getPaginationRowModel, useReactTable } from '@tanstack/react-table';
import { PEOPLE, baseUi, toolbarUi, personColumns, type Person } from './_fixtures';
import { richColumns } from './_desktop-scenarios';
import { mockViewport } from './_viewport';

const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);
const Toolbar = createDataTableWithToolbar<Person>({
  config: {
    entityName: 'people',
    filterColumns: [{ columnId: 'status', label: 'Status', options: [{ label: 'All', value: 'all' }] }],
  },
  ui: toolbarUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});

const statusFilter = {
  value: 'all',
  onChange: () => {},
  options: [
    { label: 'All', value: 'all' },
    { label: 'Ready', value: 'Ready' },
  ],
};

async function flush() {
  await act(async () => {});
}

beforeEach(() => mockViewport(390));
afterEach(() => cleanup());

describe('BaseListTable at 390px', () => {
  it('renders divider rows, not a table: title + one status line + ⋯, no checkbox', async () => {
    const { container } = render(<Base<Person> data={PEOPLE} columns={richColumns} />);
    await flush();

    expect(container.querySelector('table')).toBeNull();
    const list = screen.getByRole('list');
    expect(list.className).toContain('divide-y');
    expect(list.className.split(' ')).not.toEqual(expect.arrayContaining(['border'])); // no outer box
    expect(list.className).not.toMatch(/rounded|bg-card/);

    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const first = rows[0]!;
    expect(first.querySelector('[data-slot="mobile-row-title"]')!.textContent).toBe('Alice');
    const fields = first.querySelectorAll('[data-slot="mobile-row-field"]');
    expect(fields).toHaveLength(1); // ONE line by default — the status badge
    expect(fields[0]!.querySelector('[data-badge="status"]')!.textContent).toBe('Ready');
    expect(fields[0]!.textContent).not.toContain('Status ·'); // no label on the default line
    expect(within(first).getByLabelText('More options Alice')).toBeTruthy();
    expect(first.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain('alice@example.com'); // email not shown
  });

  it('honours mobile.title / mobile.fields (with labels)', async () => {
    render(
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        mobile={{ title: 'email', fields: ['name', 'docs'] }}
      />,
    );
    await flush();
    const first = screen.getAllByRole('listitem')[0]!;
    expect(first.querySelector('[data-slot="mobile-row-title"]')!.textContent).toBe('alice@example.com');
    const fields = [...first.querySelectorAll('[data-slot="mobile-row-field"]')].map((f) => f.textContent);
    expect(fields).toEqual(['Name·Alice', 'Docs·5']);
  });

  it('row click behaves as in the table; the ⋯ menu does not trigger it', async () => {
    const onRowClick = vi.fn();
    render(
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        getRowProps={(p) => ({ onClick: () => onRowClick(p.id), className: 'cursor-pointer' })}
      />,
    );
    await flush();
    const first = screen.getAllByRole('listitem')[0]!;
    expect(first.className).toContain('cursor-pointer');
    fireEvent.click(first);
    expect(onRowClick).toHaveBeenCalledWith('u1');
    fireEvent.click(within(first).getByLabelText('More options Alice'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('toolbar is one row: search + one Filters button; columns/refresh/view toggle live off-screen', async () => {
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        search={{ value: '', onChange: () => {}, placeholder: 'Search people...' }}
        statusFilter={statusFilter}
        onRefresh={() => {}}
        resultLabel="3 people"
        rightContent={<button type="button">Grid view</button>}
        primaryAction={<button type="button">New</button>}
      />,
    );
    await flush();
    const toolbar = container.querySelector('[data-slot="list-toolbar-mobile"]')!;
    expect(toolbar).toBeTruthy();
    expect(within(toolbar as HTMLElement).getByPlaceholderText('Search people...')).toBeTruthy();
    expect(within(toolbar as HTMLElement).getByText('New')).toBeTruthy(); // CTA stays visible
    expect(container.textContent).not.toContain('Columns');
    expect(container.textContent).not.toContain('3 people');
    expect(screen.queryByText('Grid view')).toBeNull(); // in the sheet, not the row
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByText('Filters').closest('button')!);
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByRole('combobox')).toBeTruthy(); // status filter
    expect(within(sheet).getByText('Grid view')).toBeTruthy();
    fireEvent.click(within(sheet).getByText('Done'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mobile.rightContent "hidden" drops it on phones', async () => {
    render(
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        rightContent={<button type="button">Grid view</button>}
        mobile={{ rightContent: 'hidden' }}
      />,
    );
    await flush();
    expect(screen.queryByText('Grid view')).toBeNull();
    expect(screen.queryByText('Filters')).toBeNull(); // nothing to filter → no button
  });

  it('opt-out mobile={false} keeps the table', async () => {
    const { container } = render(<Base<Person> data={PEOPLE} columns={richColumns} mobile={false} />);
    await flush();
    expect(container.querySelector('table')).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    expect(container.querySelector('[data-slot="list-toolbar-mobile"]')).toBeNull();
  });

  it('renderRow consumers keep their own rows (toolbar still compact)', async () => {
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        getRowId={(p) => p.id}
        renderRow={(p) => <div data-testid="custom">{p.name}</div>}
      />,
    );
    await flush();
    expect(screen.getAllByTestId('custom')).toHaveLength(3);
    expect(container.querySelector('[data-slot="mobile-list"]')).toBeNull();
  });

  it('empty state is a full-width block (not a clipped table cell) and the pager is hidden', async () => {
    const { container } = render(
      <Base<Person>
        data={[]}
        columns={richColumns}
        emptyState={{ title: 'No knowledge bases found', subtitle: 'Get started by creating your first one' }}
        pagination={{ pageIndex: 0, pageSize: 10, totalCount: 0, onPageChange: () => {} }}
      />,
    );
    await flush();
    expect(container.querySelector('table')).toBeNull();
    const empty = container.querySelector('[data-slot="mobile-list-empty"]')!;
    expect(empty.className).toContain('w-full');
    expect(empty.textContent).toContain('No knowledge bases found');
    expect(container.textContent).not.toMatch(/Page 1|Showing 0/);
  });

  it('pages with prev · Page x of y · next only', async () => {
    const { container } = render(
      <Base<Person>
        data={PEOPLE.slice(0, 2)}
        columns={richColumns}
        pagination={{ pageIndex: 0, pageSize: 2, totalCount: 3, onPageChange: () => {}, onPageSizeChange: () => {} }}
      />,
    );
    await flush();
    const pager = container.querySelector('[data-slot="mobile-pagination"]')!;
    expect(pager.textContent).toContain('Page 1 of 2');
    expect(container.textContent).not.toContain('Showing');
    expect(container.querySelector('select')).toBeNull(); // no page-size picker
  });
});

describe('BaseListTable pagination at 0 rows (desktop too)', () => {
  it('hides "Page 1 of 0" when the list is empty', async () => {
    mockViewport(1280);
    const { container } = render(
      <Base<Person>
        data={[]}
        columns={personColumns}
        pagination={{ pageIndex: 0, pageSize: 10, totalCount: 0, onPageChange: () => {} }}
      />,
    );
    await flush();
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Page 1|Showing 0/);
  });
});

describe('DataTableWithToolbar at 390px', () => {
  it('renders divider rows + one-row toolbar; export/view hidden; filters in the sheet', async () => {
    const { container } = render(
      <Toolbar data={PEOPLE} columns={richColumns} onRefresh={() => {}} resultLabel="3 people" />,
    );
    await flush();
    expect(container.querySelector('table')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/Export|View|Rows per page|3 people/);
    fireEvent.click(screen.getByText('Filters').closest('button')!);
    expect(within(screen.getByRole('dialog')).getAllByText('Status').length).toBeGreaterThan(0);
  });

  it('opt-out via prop keeps the table', async () => {
    const { container } = render(<Toolbar data={PEOPLE} columns={richColumns} mobile={false} />);
    await flush();
    expect(container.querySelector('table')).toBeTruthy();
  });

  it('empty: full-width message, no pager', async () => {
    const { container } = render(<Toolbar data={[]} columns={richColumns} />);
    await flush();
    expect(container.querySelector('[data-slot="mobile-list-empty"]')!.textContent).toContain('No people found.');
    expect(container.textContent).not.toContain('Page 1 of 0');
  });

  it('desktop empty list hides "Page 1 of 0" too', async () => {
    mockViewport(1280);
    const { container } = render(<Toolbar data={[]} columns={personColumns} />);
    await flush();
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).not.toContain('Page 1 of 0');
  });
});

describe('DataTablePagination', () => {
  const Pagination = createDataTablePagination(
    baseUi as unknown as Parameters<typeof createDataTablePagination>[0],
  );
  function Harness({ data }: { data: Person[] }) {
    const table = useReactTable({
      data,
      columns: personColumns,
      getCoreRowModel: getCoreRowModel(),
      getPaginationRowModel: getPaginationRowModel(),
    });
    return <Pagination table={table} />;
  }

  it('renders nothing for 0 rows', () => {
    const { container } = render(<Harness data={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the pager when there are rows', () => {
    const { container } = render(<Harness data={PEOPLE} />);
    expect(container.textContent).toContain('Page 1 of 1');
  });
});
