/**
 * SearchableSelect — THE compact dropdown for picking one item from a list.
 *
 * Standing rule (p90, 2026-09-27): every dropdown with 8+ rows has a
 * type-to-filter box at the top, and a grouped dropdown keeps its group
 * headers sticky so you always know which section you are in while scrolling.
 *
 * - Popover + a custom listbox (not a native/Radix Select, which cannot host
 *   an input). The app injects its own Popover so its scroll-lock and
 *   z-index fixes apply (`createSearchableSelect`).
 * - Search box appears when there are `searchThreshold` (default 8) or more
 *   options, and takes focus on open. Case-insensitive, on the label plus
 *   optional keywords.
 * - Groups render with sticky headers (`sticky top-0` on the popover
 *   background so rows never show through).
 * - Keyboard: ArrowUp/ArrowDown, Home/End, Enter picks, Escape closes.
 *   Disabled options are skipped and can never be picked.
 * - ARIA: trigger `combobox`, list `listbox`, rows `option`, headers inside a
 *   `group`, the focused element carries `aria-activedescendant`.
 * - Theme tokens only (`bg-popover`, `text-muted-foreground`, …). No brand.
 */

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '../../lib';

/** Search box shows at this many options or more (click over search below it). */
export const SEARCHABLE_SELECT_SEARCH_THRESHOLD = 8;

export interface SearchableSelectOption {
  /** Unique value, handed back through `onValueChange`. */
  value: string;
  /** Plain text — shown, and what the search matches. */
  label: string;
  /** Extra words the search also matches (never shown). */
  keywords?: readonly string[];
  /** Leading visual (avatar, icon). */
  icon?: React.ReactNode;
  /** One muted line under the label. */
  description?: React.ReactNode;
  /** Shown but not selectable. */
  disabled?: boolean;
  /** One short line saying why it is disabled. */
  disabledReason?: React.ReactNode;
  /**
   * An action row ("New space…", "Add a key…"): never matched by the search
   * (hidden while a search is typed) and never shown as the selected value.
   */
  action?: boolean;
  /** Custom row body. Default: icon + label (+ description / reason). */
  render?: (option: SearchableSelectOption) => React.ReactNode;
  'data-testid'?: string;
}

export interface SearchableSelectGroup {
  id: string;
  /** Sticky header text. Omit for an unlabelled group (e.g. a flat list). */
  label?: React.ReactNode;
  /** Small visual before the header text. */
  icon?: React.ReactNode;
  options: readonly SearchableSelectOption[];
  'data-testid'?: string;
}

/** Keep the options that match `query` (label + keywords, case-insensitive); drop empty groups. */
export function filterSearchableGroups(
  groups: readonly SearchableSelectGroup[],
  query: string,
): SearchableSelectGroup[] {
  const q = query.trim().toLowerCase();
  return groups
    .map((g) => ({
      ...g,
      options: g.options.filter((o) => {
        if (!q) return true;
        if (o.action) return false;
        return [o.label, ...(o.keywords ?? [])].join(' ').toLowerCase().includes(q);
      }),
    }))
    .filter((g) => g.options.length > 0);
}

/** Number of pickable-looking rows (action rows excluded). */
export function countSearchableOptions(groups: readonly SearchableSelectGroup[]): number {
  return groups.reduce((n, g) => n + g.options.filter((o) => !o.action).length, 0);
}

/**
 * The app's Popover parts (shadcn/Radix shaped). Exact prop shapes — no index
 * signature — so a Radix-based Popover is assignable without a cast.
 */
export interface SearchableSelectUIComponents {
  Popover: React.ComponentType<{
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }>;
  PopoverTrigger: React.ComponentType<{ asChild?: boolean; children?: React.ReactNode }>;
  PopoverContent: React.ComponentType<{
    align?: 'start' | 'center' | 'end';
    className?: string;
    onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    onOpenAutoFocus?: (event: Event) => void;
    children?: React.ReactNode;
  }>;
}

export interface SearchableSelectProps {
  value: string | null | undefined;
  onValueChange: (value: string) => void;
  groups: readonly SearchableSelectGroup[];
  /** Trigger text when nothing is picked. */
  placeholder?: React.ReactNode;
  /** Trigger body for the picked option (null when the value is not in the list). */
  renderValue?: (option: SearchableSelectOption | null) => React.ReactNode;
  searchPlaceholder?: string;
  /** Shown when the search matches nothing. */
  emptyText?: React.ReactNode;
  /** Default `SEARCHABLE_SELECT_SEARCH_THRESHOLD`. */
  searchThreshold?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Prefix for test ids: `<id>-trigger`, `<id>-search`, `<id>-list`. */
  'data-testid'?: string;
}

interface FlatRow {
  option: SearchableSelectOption;
  index: number;
}

function DefaultRow({ option }: { option: SearchableSelectOption }) {
  const second = option.disabled && option.disabledReason ? option.disabledReason : option.description;
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      {option.icon}
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{option.label}</span>
        {second ? (
          <span className="truncate text-xs text-muted-foreground" data-slot="option-description">
            {second}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * Build the SearchableSelect with the app's Popover (keeps the app's own
 * popover fixes — scroll lock inside modals, z-index, portal).
 */
export function createSearchableSelect(ui: SearchableSelectUIComponents) {
  const { Popover, PopoverTrigger, PopoverContent } = ui;

  function SearchableSelect({
    value,
    onValueChange,
    groups,
    placeholder = 'Select…',
    renderValue,
    searchPlaceholder = 'Search…',
    emptyText = 'No matches',
    searchThreshold = SEARCHABLE_SELECT_SEARCH_THRESHOLD,
    disabled,
    id,
    className,
    triggerClassName,
    contentClassName,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'data-testid': testId,
  }: SearchableSelectProps) {
    const baseId = React.useId();
    const listId = `${baseId}-list`;
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState('');
    const [active, setActive] = React.useState(-1);
    const listRef = React.useRef<HTMLDivElement>(null);
    const searchRef = React.useRef<HTMLInputElement>(null);

    const showSearch = countSearchableOptions(groups) >= searchThreshold;
    const shown = React.useMemo(
      () => filterSearchableGroups(groups, showSearch ? query : ''),
      [groups, query, showSearch],
    );
    const flat: FlatRow[] = React.useMemo(() => {
      const out: FlatRow[] = [];
      for (const g of shown) for (const option of g.options) out.push({ option, index: out.length });
      return out;
    }, [shown]);
    const enabled = React.useMemo(() => flat.filter((r) => !r.option.disabled), [flat]);

    const selected = React.useMemo(() => {
      for (const g of groups) for (const o of g.options) if (!o.action && o.value === value) return o;
      return null;
    }, [groups, value]);

    const optionId = (i: number) => `${baseId}-opt-${i}`;
    const activeId = active >= 0 && active < flat.length ? optionId(active) : undefined;

    const firstEnabled = (rows: FlatRow[]) => rows.find((r) => !r.option.disabled)?.index ?? -1;

    const handleOpenChange = (next: boolean) => {
      setOpen(next);
      if (next) {
        setQuery('');
        const all = filterSearchableGroups(groups, '');
        let i = 0;
        let found = -1;
        let first = -1;
        for (const g of all)
          for (const o of g.options) {
            if (first < 0 && !o.disabled) first = i;
            if (found < 0 && !o.action && !o.disabled && o.value === value) found = i;
            i++;
          }
        setActive(found >= 0 ? found : first);
      }
    };

    const choose = (row: FlatRow | undefined) => {
      if (!row || row.option.disabled) return;
      setOpen(false);
      onValueChange(row.option.value);
    };

    // Keep the active row in view while arrowing.
    React.useEffect(() => {
      if (!open || active < 0) return;
      listRef.current
        ?.querySelector<HTMLElement>(`[data-row-index="${active}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }, [active, open]);

    const move = (dir: 1 | -1) => {
      if (enabled.length === 0) return;
      const pos = enabled.findIndex((r) => r.index === active);
      const next =
        pos < 0 ? (dir === 1 ? 0 : enabled.length - 1) : Math.min(Math.max(pos + dir, 0), enabled.length - 1);
      setActive(enabled[next]!.index);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1);
          break;
        case 'Home':
          if (e.target === searchRef.current) break; // caret movement in the search box
          e.preventDefault();
          if (enabled.length) setActive(enabled[0]!.index);
          break;
        case 'End':
          if (e.target === searchRef.current) break;
          e.preventDefault();
          if (enabled.length) setActive(enabled[enabled.length - 1]!.index);
          break;
        case 'Enter':
          e.preventDefault();
          choose(flat[active]);
          break;
        case 'Escape':
          e.preventDefault();
          setOpen(false);
          break;
      }
    };

    const tid = (suffix: string) => (testId ? `${testId}-${suffix}` : undefined);

    const triggerBody = renderValue ? (
      renderValue(selected)
    ) : selected ? (
      <span className="flex min-w-0 items-center gap-2">
        {selected.icon}
        <span className="truncate">{selected.label}</span>
      </span>
    ) : null;

    return (
      <div className={className} data-testid={testId}>
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              id={id}
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? listId : undefined}
              aria-label={ariaLabel}
              aria-describedby={ariaDescribedBy}
              disabled={disabled}
              data-testid={tid('trigger')}
              className={cn(
                'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                triggerClassName,
              )}
            >
              <span className="min-w-0 flex-1 truncate">
                {triggerBody ?? <span className="text-muted-foreground">{placeholder}</span>}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={cn(
              'flex w-[var(--radix-popover-trigger-width)] min-w-[16rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0',
              contentClassName,
            )}
            onKeyDown={onKeyDown}
            onOpenAutoFocus={(e: Event) => {
              e.preventDefault();
              (searchRef.current ?? listRef.current)?.focus();
            }}
          >
            {showSearch && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  ref={searchRef}
                  type="text"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-autocomplete="list"
                  aria-activedescendant={activeId}
                  aria-label={searchPlaceholder}
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    const rows: FlatRow[] = [];
                    for (const g of filterSearchableGroups(groups, e.target.value))
                      for (const option of g.options) rows.push({ option, index: rows.length });
                    setActive(firstEnabled(rows));
                  }}
                  data-testid={tid('search')}
                  className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={showSearch ? -1 : 0}
              aria-label={ariaLabel}
              aria-activedescendant={showSearch ? undefined : activeId}
              data-testid={tid('list')}
              className="max-h-[320px] min-h-0 overflow-y-auto overscroll-contain px-1 pb-1 outline-none"
            >
              {(() => {
                let rowIdx = 0;
                return shown.map((g, gi) => (
                <div
                  key={g.id}
                  role="group"
                  aria-labelledby={g.label ? `${baseId}-grp-${g.id}` : undefined}
                  data-testid={g['data-testid']}
                  className={cn(gi > 0 && 'border-t border-border')}
                >
                  {g.label ? (
                    <div
                      id={`${baseId}-grp-${g.id}`}
                      role="presentation"
                      data-slot="group-header"
                      className="sticky top-0 z-10 -mx-1 flex items-center gap-1.5 bg-popover px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground"
                    >
                      {g.icon}
                      {g.label}
                    </div>
                  ) : (
                    <div className="h-1" aria-hidden />
                  )}
                  {g.options.map((o) => {
                    const idx = rowIdx++;
                    const isSelected = !o.action && o.value === value;
                    return (
                      <div
                        key={`${g.id}:${o.value}`}
                        id={optionId(idx)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={o.disabled || undefined}
                        data-disabled={o.disabled || undefined}
                        data-active={idx === active || undefined}
                        data-row-index={idx}
                        data-testid={o['data-testid']}
                        onMouseEnter={() => !o.disabled && setActive(idx)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(flat[idx])}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm',
                          o.disabled
                            ? 'cursor-not-allowed text-muted-foreground'
                            : 'cursor-pointer data-[active]:bg-muted',
                        )}
                      >
                        {o.render ? o.render(o) : <DefaultRow option={o} />}
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
                      </div>
                    );
                  })}
                </div>
                ));
              })()}
              {flat.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-muted-foreground" data-testid={tid('empty')}>
                  {emptyText}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return SearchableSelect;
}
