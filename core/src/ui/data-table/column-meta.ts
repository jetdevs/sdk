/**
 * Shared column meta types for data table components.
 *
 * Augments TanStack Table's `ColumnMeta` so callers can declare per-column
 * metadata that the SDK's table primitives consume — currently:
 *
 * - `label`: human-readable column name (used in column visibility menus)
 * - `align`: horizontal alignment for both header and cell content. Numeric
 *   columns (currency, counts, percentages) should set `'right'` so values
 *   line up by magnitude. Default is `'left'`.
 *
 * Consumers don't need to import this file directly — the augmentation is
 * applied by importing anything from `@jetdevs/core/ui/data-table`.
 */

// Module augmentation — make `meta.label` and `meta.align` first-class on
// every TanStack column definition. Keep both fields optional so this is
// backward compatible with existing column defs.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends unknown, TValue> {
    label?: string;
    align?: ColumnAlign;
  }
}

export type ColumnAlign = 'left' | 'center' | 'right';

/** Tailwind classes applied to a `<th>` / `<td>` for a given alignment. */
export function getAlignCellClass(align: ColumnAlign | undefined): string {
  switch (align) {
    case 'right':
      return 'text-right';
    case 'center':
      return 'text-center';
    default:
      return '';
  }
}

/**
 * Tailwind classes applied to the *inner* flex/inline wrapper of a header
 * cell so the sort-toggle button (icon + label) is pushed to the correct
 * edge. Cell-level `text-*` alone is not enough because the header content
 * is a flex row.
 */
export function getAlignHeaderClass(align: ColumnAlign | undefined): string {
  switch (align) {
    case 'right':
      return 'justify-end';
    case 'center':
      return 'justify-center';
    default:
      return '';
  }
}
