/**
 * CoreLabelsProvider — core components render English by default (unchanged
 * text) and a provided label replaces it. Missing keys fall back to English.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CoreLabelsProvider, defaultCoreLabels, mergeCoreLabels, useCoreLabels } from '..';
import { createDataTableWithToolbar } from '../../data-table/DataTableWithToolbar';
import { createStandardListToolbar } from '../../data-table/standard-toolbar';
import { createBulkDeleteDialogFactory } from '../../admin/RoleDialogs';
import { PEOPLE, baseUi, toolbarUi, personColumns, type Person } from '../../data-table/__tests__/_fixtures';
import { mockViewport } from '../../data-table/__tests__/_viewport';

const Table = createDataTableWithToolbar<Person>({
  config: { entityName: 'people' },
  ui: toolbarUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});

const Toolbar = createStandardListToolbar(
  baseUi as unknown as Parameters<typeof createStandardListToolbar>[0],
);

const Div = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
const BulkDelete = createBulkDeleteDialogFactory({
  ui: {
    AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    AlertDialogContent: Div,
    AlertDialogHeader: Div,
    AlertDialogTitle: Div,
    AlertDialogDescription: Div,
    AlertDialogFooter: Div,
    AlertDialogCancel: Div,
    AlertDialogAction: Div,
    Badge: Div,
    Separator: () => <hr />,
  } as unknown as Parameters<typeof createBulkDeleteDialogFactory>[0]['ui'],
});

async function flush() {
  await act(async () => {});
}

afterEach(() => cleanup());

describe('mergeCoreLabels', () => {
  it('keeps defaults for missing / undefined keys and ignores unknown ones', () => {
    const merged = mergeCoreLabels(defaultCoreLabels, {
      common: { cancel: 'Abbrechen', clear: undefined },
      // @ts-expect-error unknown section is ignored
      nope: { x: 'y' },
    });
    expect(merged.common.cancel).toBe('Abbrechen');
    expect(merged.common.clear).toBe('Clear');
    expect(merged.dataTable).toBe(defaultCoreLabels.dataTable);
    expect((merged as unknown as Record<string, unknown>).nope).toBeUndefined();
    expect(defaultCoreLabels.common.cancel).toBe('Cancel');
  });

  it('shares one context across core bundles (globalThis, Symbol.for)', () => {
    const key = Symbol.for('@jetdevs/core/core-labels-context');
    expect((globalThis as unknown as Record<symbol, unknown>)[key]).toBeDefined();
  });
});

describe('DataTableWithToolbar labels', () => {
  it('renders the English defaults without a provider', async () => {
    mockViewport(1280);
    const { container } = render(<Table data={PEOPLE} columns={personColumns} />);
    await flush();
    expect(container.querySelector('input[placeholder="Search people..."]')).not.toBeNull();
    expect(container.textContent).toContain('Rows per page');
    expect(container.textContent).toContain('Page 1 of 1');
    expect(container.textContent).toContain('3 of 3 people');
    expect(container.textContent).toContain('Go to next page');
  });

  it('renders "No <entity> found." when empty', async () => {
    mockViewport(1280);
    const { container } = render(<Table data={[]} columns={personColumns} />);
    await flush();
    expect(container.textContent).toContain('No people found.');
  });

  it('uses provided labels, English for the rest', async () => {
    mockViewport(1280);
    const { container } = render(
      <CoreLabelsProvider
        labels={{
          dataTable: {
            searchPlaceholder: (e) => `${e} durchsuchen…`,
            resultCount: (n, total, e) => `${n} von ${total} ${e}`,
          },
          pagination: {
            rowsPerPage: 'Zeilen pro Seite',
            pageOf: (page, count) => `Seite ${page} von ${count}`,
          },
        }}
      >
        <Table data={PEOPLE} columns={personColumns} />
      </CoreLabelsProvider>,
    );
    await flush();
    expect(container.querySelector('input[placeholder="people durchsuchen…"]')).not.toBeNull();
    expect(container.textContent).toContain('Zeilen pro Seite');
    expect(container.textContent).toContain('Seite 1 von 1');
    expect(container.textContent).toContain('3 von 3 people');
    expect(container.textContent).not.toContain('Rows per page');
    // Not provided → English.
    expect(container.textContent).toContain('Go to next page');
  });

  it('nested providers merge over the parent', async () => {
    mockViewport(1280);
    const { container } = render(
      <CoreLabelsProvider labels={{ pagination: { rowsPerPage: 'Zeilen pro Seite' } }}>
        <CoreLabelsProvider labels={{ dataTable: { noResults: (e) => `Keine ${e}.` } }}>
          <Table data={[]} columns={personColumns} />
        </CoreLabelsProvider>
      </CoreLabelsProvider>,
    );
    await flush();
    expect(container.textContent).toContain('Keine people.');
  });
});

describe('StandardListToolbar labels', () => {
  const search = { value: '', onChange: () => {} };
  const columns = [{ id: 'name', label: 'Name', visible: true, onToggle: () => {} }];

  it('English defaults', () => {
    const { container } = render(<Toolbar search={search} columns={columns} />);
    expect(container.querySelector('input[placeholder="Search…"][aria-label="Search"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Columns"]')).not.toBeNull();
  });

  it('provider labels, and an explicit prop still wins', () => {
    const { container } = render(
      <CoreLabelsProvider
        labels={{ common: { columns: 'Spalten' }, standardToolbar: { searchPlaceholder: 'Suchen…', searchLabel: 'Suchen' } }}
      >
        <Toolbar search={search} columns={columns} />
        <Toolbar search={search} columns={columns} columnsLabel="Felder" testId="t2" />
      </CoreLabelsProvider>,
    );
    expect(container.querySelector('input[placeholder="Suchen…"][aria-label="Suchen"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="list-columns"]')!.getAttribute('aria-label')).toBe('Spalten');
    expect(container.querySelector('[data-testid="t2-columns"]')!.getAttribute('aria-label')).toBe('Felder');
  });
});

describe('BulkDeleteDialog labels', () => {
  const roles = [
    { id: 1, name: 'Editor', isSystemRole: false, userCount: 2, permissionCount: 5 },
    { id: 2, name: 'Owner', isSystemRole: true, userCount: 1, permissionCount: 9 },
  ] as unknown as React.ComponentProps<typeof BulkDelete>['roles'];

  it('English defaults', () => {
    const { container } = render(<BulkDelete open onClose={() => {}} onConfirm={() => {}} roles={roles} />);
    expect(container.textContent).toContain('Confirm Bulk Delete');
    expect(container.textContent).toContain('You are about to delete 2 role(s). This action cannot be undone.');
    expect(container.textContent).toContain('The following 1 system role(s) will be skipped:');
    expect(container.textContent).toContain('Delete 1 Role(s)');
    expect(container.textContent).toContain('Cancel');
  });

  it('provided labels', () => {
    const { container } = render(
      <CoreLabelsProvider
        labels={{
          common: { cancel: 'Abbrechen' },
          bulkDeleteRoles: { title: 'Mehrere löschen', confirm: (n) => `${n} Rolle(n) löschen` },
        }}
      >
        <BulkDelete open onClose={() => {}} onConfirm={() => {}} roles={roles} />
      </CoreLabelsProvider>,
    );
    expect(container.textContent).toContain('Mehrere löschen');
    expect(container.textContent).toContain('1 Rolle(n) löschen');
    expect(container.textContent).toContain('Abbrechen');
    expect(container.textContent).not.toContain('Confirm Bulk Delete');
  });
});

describe('useCoreLabels', () => {
  it('returns the English defaults without a provider', () => {
    let seen: unknown;
    const Probe = () => {
      seen = useCoreLabels();
      return null;
    };
    render(<Probe />);
    expect(seen).toBe(defaultCoreLabels);
  });
});
