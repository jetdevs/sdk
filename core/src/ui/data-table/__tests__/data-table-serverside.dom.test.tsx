/**
 * `DataTableWithToolbar` server-side mode (`pagination` / `sorting` / `search` /
 * `serverFilters` / `onExportData` / `resultLabel`).
 *
 * WHY these assertions and not "does it look right": before these props existed
 * the component was client-only, so every server-paginated backoffice list
 * forked into a bespoke table. The failure mode a forked table hits is not a
 * missing affordance — it is a CORRECT-LOOKING WRONG ANSWER: a sort control that
 * reorders the loaded page while the user reads it as ordering the whole set.
 * So the load-bearing test here is `does NOT reorder rows locally`.
 *
 * Back-compat for client-side consumers is covered by the byte-identical
 * baseline snapshots in `data-table-renderrow.dom.test.tsx`.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { PEOPLE, toolbarUi, type Person } from './_fixtures';

// The shared Select stub swallows onValueChange; server filters need it live.
const liveSelectUi = {
  ...toolbarUi,
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children?: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <div data-testid="select" data-value={value}>
      <button type="button" data-testid={`select-change-${value}`} onClick={() => onValueChange?.('ID')}>
        change
      </button>
      {children}
    </div>
  ),
};

const Toolbar = createDataTableWithToolbar<Person>({
  config: { entityName: 'people' },
  ui: liveSelectUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});

/** Columns whose `name` header is a real sort trigger, mirroring DataTableColumnHeader. */
const sortableColumns: ColumnDef<Person, unknown>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <button type="button" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Name
      </button>
    ),
    cell: (c) => c.getValue() as string,
  },
  { accessorKey: 'email', header: 'Email', enableSorting: false, cell: (c) => c.getValue() as string },
];

const bodyNames = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('tbody tr')).map(
    (tr) => tr.querySelector('td')?.textContent ?? '',
  );

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('server-side sorting', () => {
  it('reports the next SortingState to onChange instead of sorting locally', () => {
    const onChange = vi.fn();
    render(
      <Toolbar
        data={PEOPLE}
        columns={sortableColumns}
        sorting={{ state: [{ id: 'name', desc: false }], onChange }}
      />,
    );

    fireEvent.click(screen.getByText('Name'));

    expect(onChange).toHaveBeenCalledTimes(1);
    // asc was already active, so the toggle asks for desc — the consumer turns
    // this into sortBy=name & sortOrder=desc.
    expect(onChange.mock.calls[0][0]).toEqual([{ id: 'name', desc: true }]);
  });

  it('does NOT reorder rows locally — the backend owns the order', () => {
    // Backend returned Carol, Alice, Bob. A client-side sort would "helpfully"
    // re-alphabetise this page, contradicting the server ordering the user is
    // actually paging through.
    const serverOrder: Person[] = [PEOPLE[2], PEOPLE[0], PEOPLE[1]];
    const { container } = render(
      <Toolbar
        data={serverOrder}
        columns={sortableColumns}
        sorting={{ state: [{ id: 'name', desc: false }], onChange: vi.fn() }}
      />,
    );

    expect(bodyNames(container)).toEqual(['Carol', 'Alice', 'Bob']);
  });

  it('still sorts locally when the sorting prop is absent (client-side consumers)', () => {
    const serverOrder: Person[] = [PEOPLE[2], PEOPLE[0], PEOPLE[1]];
    const { container } = render(<Toolbar data={serverOrder} columns={sortableColumns} />);

    fireEvent.click(screen.getByText('Name'));

    expect(bodyNames(container)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

describe('server-side pagination', () => {
  const paginationProps = (over: Partial<Record<string, unknown>> = {}) => ({
    pageIndex: 0,
    pageSize: 3,
    totalCount: 42,
    onPageChange: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...over,
  });

  it('derives page count from totalCount, not from the loaded rows', () => {
    render(<Toolbar data={PEOPLE} columns={sortableColumns} pagination={paginationProps()} />);
    // 42 rows at pageSize 3 => 14 pages, even though only 3 rows are loaded.
    expect(screen.getByText(/Page 1 of\s*14/)).toBeTruthy();
  });

  it('routes next-page to onPageChange rather than slicing the loaded array', () => {
    const onPageChange = vi.fn();
    const { container } = render(
      <Toolbar
        data={PEOPLE}
        columns={sortableColumns}
        pagination={paginationProps({ onPageChange })}
      />,
    );

    const buttons = Array.from(container.querySelectorAll('button'));
    const next = buttons.find((b) => within(b).queryByText('Go to next page'));
    fireEvent.click(next as HTMLButtonElement);

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('renders every loaded row (the server already applied the page window)', () => {
    const { container } = render(
      <Toolbar
        data={PEOPLE}
        columns={sortableColumns}
        pagination={paginationProps({ pageSize: 2 })}
      />,
    );
    // pageSize 2 must NOT drop Carol — the backend decides the window.
    expect(bodyNames(container)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('server-side search', () => {
  it('debounces the input before calling onChange', () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn();
      render(
        <Toolbar
          data={PEOPLE}
          columns={sortableColumns}
          search={{ value: '', onChange, debounceMs: 300 }}
        />,
      );

      const input = screen.getByPlaceholderText('Search people...');
      fireEvent.change(input, { target: { value: 'a' } });
      fireEvent.change(input, { target: { value: 'al' } });
      fireEvent.change(input, { target: { value: 'ali' } });

      expect(onChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(300);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('ali');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not filter the loaded rows locally', () => {
    const { container } = render(
      <Toolbar
        data={PEOPLE}
        columns={sortableColumns}
        search={{ value: 'zzzz-no-match', onChange: vi.fn() }}
      />,
    );
    // The backend already answered this search; the table must show what it sent.
    expect(bodyNames(container)).toEqual(['Alice', 'Bob', 'Carol']);
  });
});

// ---------------------------------------------------------------------------
// Server filters + result label
// ---------------------------------------------------------------------------

describe('server filters and result label', () => {
  it('calls the filter onChange with the selected value', () => {
    const onChange = vi.fn();
    render(
      <Toolbar
        data={PEOPLE}
        columns={sortableColumns}
        serverFilters={[
          {
            id: 'region',
            label: 'Region',
            value: 'all',
            onChange,
            options: [
              { label: 'All Regions', value: 'all' },
              { label: 'ID', value: 'ID' },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('select-change-all'));
    expect(onChange).toHaveBeenCalledWith('ID');
  });

  it('shows resultLabel instead of the loaded-row count', () => {
    render(
      <Toolbar data={PEOPLE} columns={sortableColumns} resultLabel="Showing 3 of 42" />,
    );
    expect(screen.getByText('Showing 3 of 42')).toBeTruthy();
    // The misleading default must be gone, not merely appended to.
    expect(screen.queryByText('3 of 3 people')).toBeNull();
  });
});
