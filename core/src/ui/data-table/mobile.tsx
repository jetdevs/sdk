'use client';

/**
 * p90 — phone rendering for the shared list components.
 *
 * Below the `md` breakpoint (768px) BaseListTable / DataTableWithToolbar stop
 * rendering a wide `<table>` (which forced a horizontal swipe) and render each
 * row as a compact, edge-to-edge line: the primary column as the title, ONE
 * status line under it, and the row-actions menu (⋯) at the right. Rows are
 * separated by thin dividers — no card borders, backgrounds or gaps.
 *
 * Desktop is byte-for-byte unchanged: the media query is read through
 * `useSyncExternalStore` whose SERVER snapshot is `false`, so server markup and
 * any viewport ≥ 768px take exactly the pre-p90 table path.
 */

import type { Column, Row, Table } from '@tanstack/react-table';
import { flexRender } from '@tanstack/react-table';
import * as React from 'react';
import { useSyncExternalStore } from 'react';

// =============================================================================
// CONFIG
// =============================================================================

/** Media query for "phone" list rendering — strictly below Tailwind's `md`. */
export const MOBILE_LIST_QUERY = '(max-width: 767.98px)';

/**
 * Phone rendering options. Pass `false` to keep the table on phones (opt-out).
 */
export interface MobileListConfig {
  /** Column id used as the row title. Default: first visible data column. */
  title?: string;
  /**
   * Column ids rendered as secondary lines under the title. Default: ONE line —
   * the first visible column whose id contains "status", else the next visible
   * data column. Keep this short: phones should show only what's needed.
   */
  fields?: string[];
  /**
   * Prefix each secondary line with its column label (`Label · value`).
   * Default: `true` when `fields` is given explicitly, `false` for the default
   * single status line (a status badge speaks for itself).
   */
  showLabels?: boolean;
  /** Column id whose cell holds the row-actions menu (⋯). Default `'actions'`. */
  actions?: string;
  /**
   * Where the toolbar's `rightContent` (BaseListTable) goes on phones:
   * `'sheet'` (default) — inside the filters sheet; `'inline'` — stays in the
   * toolbar row (use for a primary CTA); `'hidden'` — not rendered on phones
   * (view toggles, secondary controls).
   */
  rightContent?: 'sheet' | 'inline' | 'hidden';
}

export type MobileListOption = MobileListConfig | false;

const SELECT_COLUMN_ID = 'select';
const DEFAULT_ACTIONS_COLUMN_ID = 'actions';

// =============================================================================
// MEDIA QUERY HOOK
// =============================================================================

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia(MOBILE_LIST_QUERY);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }
  // Safari < 14
  media.addListener?.(onChange);
  return () => media.removeListener?.(onChange);
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_LIST_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the viewport is below `md` AND the phone layout is enabled.
 * Always `false` on the server (desktop markup is the SSR default).
 */
export function useIsMobileList(enabled: boolean): boolean {
  const matches = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return enabled && matches;
}

// =============================================================================
// COLUMN RESOLUTION
// =============================================================================

/** "documentCount" / "last_updated" → "Document count" / "Last updated". */
export function humanizeColumnId(id: string): string {
  const spaced = id
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Human label for a column: `meta.label` → original string header → humanized id.
 * `headerLabels` carries string headers captured before any header rewriting.
 */
export function getColumnLabel<TData>(
  column: Column<TData, unknown>,
  headerLabels?: Record<string, string>,
): string {
  const meta = column.columnDef.meta;
  if (meta?.label) return meta.label;
  if (headerLabels?.[column.id]) return headerLabels[column.id];
  if (typeof column.columnDef.header === 'string') return column.columnDef.header;
  return humanizeColumnId(column.id);
}

/** Map column id → string header, from the RAW column defs. */
export function collectHeaderLabels(
  columns: ReadonlyArray<{ id?: string; header?: unknown; accessorKey?: unknown }>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const col of columns) {
    const id = col.id ?? (typeof col.accessorKey === 'string' ? col.accessorKey : undefined);
    if (id && typeof col.header === 'string') labels[id] = col.header;
  }
  return labels;
}

interface ResolvedCardColumns {
  titleId: string | undefined;
  fieldIds: string[];
  actionsId: string | undefined;
  showLabels: boolean;
}

export function resolveCardColumns<TData>(
  table: Table<TData>,
  config: MobileListConfig,
): ResolvedCardColumns {
  const visible = table.getVisibleLeafColumns().map((c) => c.id);
  const actionsCandidate = config.actions ?? DEFAULT_ACTIONS_COLUMN_ID;
  const actionsId = visible.includes(actionsCandidate) ? actionsCandidate : undefined;
  const dataIds = visible.filter((id) => id !== SELECT_COLUMN_ID && id !== actionsId);

  const titleId =
    config.title && table.getColumn(config.title) ? config.title : dataIds[0];
  const rest = dataIds.filter((id) => id !== titleId);

  let fieldIds: string[];
  if (config.fields) {
    fieldIds = config.fields.filter((id) => id !== titleId && table.getColumn(id));
  } else {
    const status = rest.find((id) => /status/i.test(id));
    fieldIds = status ? [status] : rest.slice(0, 1);
  }

  return {
    titleId,
    fieldIds,
    actionsId,
    showLabels: config.showLabels ?? Boolean(config.fields),
  };
}

// =============================================================================
// CARD LIST
// =============================================================================

function renderCell<TData>(row: Row<TData>, columnId: string): React.ReactNode {
  const cell = row.getAllCells().find((c) => c.column.id === columnId);
  if (!cell) return null;
  return flexRender(cell.column.columnDef.cell, cell.getContext()) as React.ReactNode;
}

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

export interface MobileRowListProps<TData> {
  table: Table<TData>;
  config: MobileListConfig;
  headerLabels?: Record<string, string>;
  /** Row click / attributes — the same `getRowProps` the table rows receive. */
  getRowProps?: (row: TData) => React.HTMLAttributes<HTMLTableRowElement>;
  /** Rendered (full width, centred) when there are no rows. */
  empty: React.ReactNode;
}

/**
 * Phone list: one edge-to-edge row per record — title, one status line, ⋯.
 * Rows are separated by thin dividers; there is no outer box.
 */
export function MobileRowList<TData>({
  table,
  config,
  headerLabels,
  getRowProps,
  empty,
}: MobileRowListProps<TData>) {
  const rows = table.getRowModel().rows;
  if (!rows.length) {
    return (
      <div data-slot="mobile-list-empty" className="w-full px-4 py-10 text-center">
        {empty}
      </div>
    );
  }

  const { titleId, fieldIds, actionsId, showLabels } = resolveCardColumns(table, config);

  return (
    <div role="list" data-slot="mobile-list" className="divide-y divide-border">
      {rows.map((row) => {
        const rowProps = (getRowProps ? getRowProps(row.original) : {}) as React.HTMLAttributes<HTMLDivElement>;
        const { className: rowClassName, ...restRowProps } = rowProps;
        return (
          <div
            key={row.id}
            role="listitem"
            data-slot="mobile-row"
            data-state={row.getIsSelected() ? 'selected' : undefined}
            {...restRowProps}
            className={['flex min-w-0 items-start gap-3 py-3', rowClassName].filter(Boolean).join(' ')}
          >
            <div className="min-w-0 flex-1">
              {titleId && (
                <div data-slot="mobile-row-title" className="min-w-0 break-words font-medium">
                  {renderCell(row, titleId)}
                </div>
              )}
              {fieldIds.map((id) => {
                const column = table.getColumn(id);
                if (!column) return null;
                return (
                  <div
                    key={id}
                    data-slot="mobile-row-field"
                    className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground"
                  >
                    {showLabels && (
                      <>
                        <span>{getColumnLabel(column, headerLabels)}</span>
                        <span aria-hidden="true">·</span>
                      </>
                    )}
                    <div className="min-w-0 break-words">{renderCell(row, id)}</div>
                  </div>
                );
              })}
            </div>
            {actionsId && (
              // Menu clicks (incl. portalled content, which bubbles through the
              // React tree) must not trigger the row's own onClick.
              <div data-slot="mobile-row-actions" className="-my-1 shrink-0" onClick={stopPropagation}>
                {renderCell(row, actionsId)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// FILTER SHEET
// =============================================================================

export const FilterIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M3 6h18" />
    <path d="M7 12h10" />
    <path d="M10 18h4" />
  </svg>
);

const CloseIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/** Minimal bottom sheet (no portal / no extra dependency). Phones only. */
export function MobileSheet({ open, onClose, title, children }: MobileSheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title} data-slot="mobile-sheet">
      <div className="absolute inset-0 bg-background/80" onClick={onClose} data-slot="mobile-sheet-overlay" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-lg border-t border-border bg-card p-4 text-card-foreground shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <CloseIcon className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

/** Labelled section inside the sheet. */
export function MobileSheetField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
