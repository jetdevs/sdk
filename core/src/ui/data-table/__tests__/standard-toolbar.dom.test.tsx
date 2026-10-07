/**
 * p90 standard list toolbar — one fixed shape, opt-in on both list factories.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBaseListTable } from '../BaseListTable';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createStandardListToolbar, hasActiveFilter, shouldShowChips } from '../standard-toolbar';
import { StatusText } from '../status-text';
import { PEOPLE, baseUi, personColumns, toolbarUi, type Person } from './_fixtures';
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

const STATUS = [
  { label: 'All', value: 'all' },
  { label: 'Live', value: 'live' },
  { label: 'Draft', value: 'draft' },
];

async function flush() {
  await act(async () => {});
}

afterEach(() => cleanup());

describe('helpers', () => {
  it('chips need two real choices', () => {
    expect(shouldShowChips(undefined)).toBe(false);
    expect(shouldShowChips({ value: 'all', onChange: () => {}, options: STATUS.slice(0, 2) })).toBe(false);
    expect(shouldShowChips({ value: 'all', onChange: () => {}, options: STATUS })).toBe(true);
  });
  it('active filter = any group off its empty value', () => {
    const g = { id: 's', label: 'Source', options: STATUS, onChange: () => {} };
    expect(hasActiveFilter([{ ...g, value: 'all' }])).toBe(false);
    expect(hasActiveFilter([{ ...g, value: 'live' }])).toBe(true);
    expect(hasActiveFilter([{ ...g, value: 'any', emptyValue: 'any' }])).toBe(false);
  });
});

describe('StandardListToolbar', () => {
  it('draws search, in-box filter, chips and view toggle — nothing else', async () => {
    mockViewport(1280);
    const onChip = vi.fn();
    const onFilter = vi.fn();
    const onView = vi.fn();
    const { container, getByText, getByLabelText } = render(
      <Toolbar
        search={{ value: '', onChange: () => {}, placeholder: 'Search agents…' }}
        filters={[{ id: 'source', label: 'Source', value: 'all', options: STATUS, onChange: onFilter }]}
        filterLabel="Filter"
        chips={{ value: 'all', onChange: onChip, options: STATUS, label: 'Status' }}
        view={{ value: 'list', onChange: onView }}
      />,
    );
    await flush();
    expect(container.querySelector('input[placeholder="Search agents…"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-filter"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-chips"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-view-toggle"]')).not.toBeNull();
    // No refresh / columns / count.
    expect(container.textContent).not.toMatch(/Columns|results|Rows per page/);

    fireEvent.click(getByText('Live', { selector: 'button' }));
    expect(onChip).toHaveBeenCalledWith('live');
    fireEvent.click(getByText('Draft', { selector: '[role="menuitemcheckbox"]' }));
    expect(onFilter).toHaveBeenCalledWith('draft');
    fireEvent.click(getByLabelText('Grid view'));
    expect(onView).toHaveBeenCalledWith('grid');
  });

  it('omits the filter button, chips and toggle when not configured', async () => {
    const { container } = render(
      <Toolbar
        search={{ value: '', onChange: () => {} }}
        chips={{ value: 'all', onChange: () => {}, options: STATUS.slice(0, 2) }}
        testId="kb"
      />,
    );
    await flush();
    expect(container.querySelector('[data-testid="kb-search"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="kb-filter"]')).toBeNull();
    expect(container.querySelector('[data-testid="kb-chips"]')).toBeNull();
    expect(container.querySelector('[data-testid="list-view-toggle"]')).toBeNull();
  });
});

describe('BaseListTable standardToolbar', () => {
  it('replaces the legacy toolbar and drops count and refresh (Columns menu + page size stay)', async () => {
    mockViewport(1280);
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={personColumns}
        search={{ value: '', onChange: () => {}, placeholder: 'Search people…' }}
        onRefresh={() => {}}
        resultLabel="3 people"
        pagination={{ pageIndex: 0, pageSize: 2, totalCount: 3, onPageChange: () => {}, onPageSizeChange: () => {} }}
        standardToolbar={{ chips: { value: 'all', onChange: () => {}, options: STATUS } }}
      />,
    );
    await flush();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Search people…"]')).not.toBeNull();
    expect(container.textContent).not.toContain('3 people');
    expect(container.querySelector('[data-testid="list-columns"]')).not.toBeNull();
    expect(container.querySelector('select')).not.toBeNull();
    expect(container.textContent).toContain('Alice');
  });

  it('is unchanged without standardToolbar', async () => {
    mockViewport(1280);
    const { container } = render(
      <Base<Person> data={PEOPLE} columns={personColumns} resultLabel="3 people" onRefresh={() => {}} />,
    );
    await flush();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).toBeNull();
    expect(container.textContent).toContain('3 people');
  });

  it('phones get the same shape (no view toggle markup change beyond md:flex)', async () => {
    mockViewport(390);
    const { container } = render(
      <Base<Person>
        data={PEOPLE}
        columns={personColumns}
        standardToolbar={{ search: { value: '', onChange: () => {} } }}
      />,
    );
    await flush();
    expect(container.querySelector('[data-slot="list-toolbar-mobile"]')).toBeNull();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).not.toBeNull();
  });
});

describe('DataTableWithToolbar standardToolbar', () => {
  const Dt = createDataTableWithToolbar<Person>({
    config: {
      entityName: 'people',
      filterColumns: [{ columnId: 'name', label: 'Name', options: [{ label: 'All', value: 'all' }, { label: 'Alice', value: 'Alice' }] }],
    },
    ui: { ...toolbarUi, DropdownMenuCheckboxItem: CheckboxItem } as unknown as Parameters<
      typeof createDataTableWithToolbar<Person>
    >[0]['ui'],
  });

  it('moves the column filters into the search box and drops export / count', async () => {
    mockViewport(1280);
    const { container } = render(<Dt data={PEOPLE} columns={personColumns} onRefresh={() => {}} standardToolbar={{}} />);
    await flush();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Search people..."]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-filter"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Export');
    expect(container.textContent).not.toContain('3 of 3 people');
  });

  it('is unchanged without standardToolbar', async () => {
    mockViewport(1280);
    const { container } = render(<Dt data={PEOPLE} columns={personColumns} />);
    await flush();
    expect(container.querySelector('[data-slot="standard-list-toolbar"]')).toBeNull();
    expect(container.textContent).toContain('3 of 3 people');
  });
});

describe('StatusText', () => {
  it('renders the word with a tone class, no dot', () => {
    const { container } = render(<StatusText tone="destructive">Failed</StatusText>);
    const el = container.firstElementChild!;
    expect(el.textContent).toBe('Failed');
    expect(el.className).toContain('text-destructive');
    expect(el.getAttribute('data-tone')).toBe('destructive');
  });
});
