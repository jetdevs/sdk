/**
 * p90 — desktop back-compat scenarios.
 *
 * Each scenario is a realistic, NON-empty desktop render (toolbar + filters +
 * row actions + select + pagination + row click props). Their markup was
 * captured from the code BEFORE the mobile card mode existed
 * (`__baseline__/desktop.*.html`, written by `desktop-backcompat.dom.test.tsx`
 * with `CAPTURE_DESKTOP_BASELINE=1`). The test asserts the post-change desktop
 * render is byte-identical, both server-rendered and client-rendered.
 */
import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createBaseListTable } from '../BaseListTable';
import { PEOPLE, toolbarUi, baseUi, type Person } from './_fixtures';

const noop = () => {};

export const richColumns: ColumnDef<Person, unknown>[] = [
  {
    id: 'select',
    header: () => <input type="checkbox" aria-label="Select all" />,
    cell: ({ row }) => (
      <input
        type="checkbox"
        aria-label="Select row"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
      />
    ),
    enableHiding: false,
  },
  { accessorKey: 'name', header: 'Name', cell: (c) => <strong>{c.getValue() as string}</strong> },
  { accessorKey: 'email', header: 'Email', cell: (c) => c.getValue() as string },
  {
    id: 'status',
    accessorFn: (p) => (p.id === 'u2' ? 'Draft' : 'Ready'),
    header: 'Status',
    meta: { label: 'Status' },
    cell: (c) => <span data-badge="status">{c.getValue() as string}</span>,
  },
  {
    id: 'docs',
    accessorFn: (p) => p.name.length,
    header: 'Docs',
    meta: { align: 'right' },
    cell: (c) => String(c.getValue()),
  },
  {
    id: 'actions',
    enableSorting: false,
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => (
      <button type="button" aria-label={`More options ${row.original.name}`}>
        ⋯
      </button>
    ),
  },
];

const Toolbar = createDataTableWithToolbar<Person>({
  config: {
    entityName: 'people',
    filterColumns: [
      { columnId: 'status', label: 'Status', options: [{ label: 'All', value: 'all' }, { label: 'Ready', value: 'Ready' }] },
    ],
    bulkActions: [{ id: 'delete', label: 'Delete', variant: 'destructive', onAction: noop }],
  },
  ui: toolbarUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});

const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);

export const desktopScenarios: Array<{ name: string; element: () => React.ReactElement }> = [
  {
    name: 'base-full',
    element: () => (
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        search={{ value: '', onChange: noop, placeholder: 'Search people...' }}
        statusFilter={{ value: 'all', onChange: noop, options: [{ label: 'All', value: 'all' }, { label: 'Ready', value: 'Ready' }] }}
        onRefresh={noop}
        resultLabel="3 people"
        rightContent={<button type="button">New person</button>}
        pagination={{ pageIndex: 0, pageSize: 2, totalCount: 3, onPageChange: noop, onPageSizeChange: noop }}
        emptyState={{ title: 'No people yet', subtitle: 'Add one' }}
        getRowProps={(p) => ({ className: 'cursor-pointer', onClick: noop, 'aria-label': p.name } as React.HTMLAttributes<HTMLTableRowElement>)}
      />
    ),
  },
  {
    name: 'base-two-row-filtered',
    element: () => (
      <Base<Person>
        data={PEOPLE}
        columns={richColumns}
        toolbarLayout="two-row"
        search={{ value: 'al', onChange: noop }}
        statusFilter={{ value: 'Ready', onChange: noop, options: [{ label: 'All', value: 'all' }, { label: 'Ready', value: 'Ready' }] }}
        defaultVisibleColumns={['name', 'status', 'actions']}
        density="compact"
      />
    ),
  },
  {
    name: 'toolbar-full',
    element: () => (
      <Toolbar
        data={PEOPLE}
        columns={richColumns}
        onRefresh={noop}
        resultLabel="3 people"
        isFetching
        search={{ value: 'a', onChange: noop }}
        serverFilters={[{ id: 'country', label: 'Country', value: 'all', onChange: noop, options: [{ label: 'All', value: 'all' }] }]}
        pagination={{ pageIndex: 0, pageSize: 2, totalCount: 3, onPageChange: noop, onPageSizeChange: noop }}
      />
    ),
  },
  {
    name: 'toolbar-renderrow-cards',
    element: () => (
      <Toolbar
        data={PEOPLE}
        columns={richColumns}
        getRowId={(p) => p.id}
        rowLayout="cards"
        renderRow={(p) => <div className="rounded border p-2">{p.name}</div>}
      />
    ),
  },
];
