/**
 * p90 — THE searchable dropdown: search at 8+, sticky group headers, keyboard,
 * disabled rows never pickable, ARIA.
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as selectModule from '../index';
import {
  SEARCHABLE_SELECT_SEARCH_THRESHOLD,
  createSearchableSelect,
  filterSearchableGroups,
  type SearchableSelectGroup,
} from '../index';

afterEach(() => cleanup());

// A stand-in Popover: renders the content inline while open (the app injects Radix).
const Ctx = React.createContext<{ open: boolean; setOpen: (o: boolean) => void }>({
  open: false,
  setOpen: () => {},
});
function Popover({ open = false, onOpenChange, children }: { open?: boolean; onOpenChange?: (o: boolean) => void; children?: React.ReactNode }) {
  return <Ctx.Provider value={{ open, setOpen: (o) => onOpenChange?.(o) }}>{children}</Ctx.Provider>;
}
function PopoverTrigger({ children }: { children?: React.ReactNode; asChild?: boolean }) {
  const { open, setOpen } = React.useContext(Ctx);
  const child = React.Children.only(children) as React.ReactElement<{ onClick?: () => void }>;
  return React.cloneElement(child, { onClick: () => setOpen(!open) });
}
function PopoverContent({
  children,
  className,
  onKeyDown,
  onOpenAutoFocus,
}: {
  children?: React.ReactNode;
  className?: string;
  onKeyDown?: React.KeyboardEventHandler;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  const { open } = React.useContext(Ctx);
  React.useEffect(() => {
    if (open) onOpenAutoFocus?.(new Event('focus'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return open ? (
    <div data-testid="content" className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  ) : null;
}

const SearchableSelect = createSearchableSelect({ Popover, PopoverTrigger, PopoverContent });

function groupsOf(n: number): SearchableSelectGroup[] {
  const teams = [
    { value: 'team:a', label: 'Sales team' },
    { value: 'team:b', label: 'Broken team', disabled: true, disabledReason: 'Needs a lead' },
  ];
  const agents = Array.from({ length: Math.max(0, n - teams.length) }, (_, i) => ({
    value: `agent:${i}`,
    label: `Agent ${i}`,
    keywords: i === 0 ? ['helper'] : undefined,
  }));
  return [
    { id: 'teams', label: 'Teams', options: teams, 'data-testid': 'group-teams' },
    { id: 'agents', label: 'Agents', options: agents, 'data-testid': 'group-agents' },
  ];
}

function Host({ groups, initial = null, spy }: { groups: SearchableSelectGroup[]; initial?: string | null; spy?: (v: string) => void }) {
  const [value, setValue] = React.useState<string | null>(initial);
  return (
    <SearchableSelect
      value={value}
      onValueChange={(v) => {
        setValue(v);
        spy?.(v);
      }}
      groups={groups}
      placeholder="Pick one"
      aria-label="Pick"
      data-testid="ss"
    />
  );
}

const open = () => fireEvent.click(screen.getByTestId('ss-trigger'));

describe('module surface', () => {
  it('exports no product brand', () => {
    expect(Object.keys(selectModule).filter((n) => /cadra|yobo/i.test(n))).toEqual([]);
    expect(SEARCHABLE_SELECT_SEARCH_THRESHOLD).toBe(8);
  });
});

describe('filterSearchableGroups', () => {
  it('matches label or keywords, case-insensitive, and drops empty groups', () => {
    const g = groupsOf(10);
    expect(filterSearchableGroups(g, 'SALES').map((x) => x.id)).toEqual(['teams']);
    expect(filterSearchableGroups(g, 'helper')[0]!.options.map((o) => o.value)).toEqual(['agent:0']);
  });

  it('hides action rows while a search is typed', () => {
    const g: SearchableSelectGroup[] = [
      { id: 'x', options: [{ value: 'a', label: 'Alpha' }, { value: 'new', label: 'New alpha…', action: true }] },
    ];
    expect(filterSearchableGroups(g, '')[0]!.options).toHaveLength(2);
    expect(filterSearchableGroups(g, 'alpha')[0]!.options.map((o) => o.value)).toEqual(['a']);
  });
});

describe('SearchableSelect', () => {
  it('shows the search box only at the threshold (8+ options)', () => {
    const { unmount } = render(<Host groups={groupsOf(SEARCHABLE_SELECT_SEARCH_THRESHOLD - 1)} />);
    open();
    expect(screen.queryByTestId('ss-search')).toBeNull();
    unmount();
    render(<Host groups={groupsOf(SEARCHABLE_SELECT_SEARCH_THRESHOLD)} />);
    open();
    expect(screen.getByTestId('ss-search')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByTestId('ss-search'));
  });

  it('filters rows as you type and shows "No matches" when nothing fits', () => {
    render(<Host groups={groupsOf(14)} />);
    open();
    fireEvent.change(screen.getByTestId('ss-search'), { target: { value: 'agent 1' } });
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['Agent 1', 'Agent 10', 'Agent 11'].map((l) => expect.stringContaining(l)));
    expect(screen.queryByTestId('group-teams')).toBeNull();
    fireEvent.change(screen.getByTestId('ss-search'), { target: { value: 'zzz' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByTestId('ss-empty').textContent).toBe('No matches');
  });

  it('group headers are sticky on the popover background', () => {
    render(<Host groups={groupsOf(4)} />);
    open();
    const header = within(screen.getByTestId('group-agents')).getByText('Agents');
    expect(header.className).toContain('sticky');
    expect(header.className).toContain('top-0');
    expect(header.className).toContain('bg-popover');
    expect(screen.getByTestId('group-agents').getAttribute('role')).toBe('group');
  });

  it('keyboard: arrows skip disabled rows, Enter picks, Escape closes', () => {
    const spy = vi.fn();
    render(<Host groups={groupsOf(5)} spy={spy} />);
    open();
    const list = screen.getByRole('listbox');
    // Opens on the first enabled row ("Sales team"); ArrowDown skips "Broken team".
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(list.getAttribute('aria-activedescendant')).toBe(
      screen.getByRole('option', { name: /Agent 0/ }).id,
    );
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('agent:2');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByTestId('ss-trigger').textContent).toContain('Agent 2');

    open();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Home' });
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(spy).toHaveBeenLastCalledWith('team:a');

    open();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('a disabled option shows its reason and cannot be picked', () => {
    const spy = vi.fn();
    render(<Host groups={groupsOf(4)} spy={spy} />);
    open();
    const broken = screen.getByRole('option', { name: /Broken team/ });
    expect(broken.getAttribute('aria-disabled')).toBe('true');
    expect(broken.textContent).toContain('Needs a lead');
    fireEvent.click(broken);
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox')).toBeTruthy();
  });

  it('marks the selected option and shows it in the trigger; placeholder when empty', () => {
    const { unmount } = render(<Host groups={groupsOf(4)} />);
    expect(screen.getByTestId('ss-trigger').textContent).toContain('Pick one');
    unmount();
    render(<Host groups={groupsOf(4)} initial="agent:1" />);
    expect(screen.getByTestId('ss-trigger').textContent).toContain('Agent 1');
    open();
    expect(screen.getByRole('option', { name: /Agent 1/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('ss-trigger').getAttribute('aria-expanded')).toBe('true');
  });
});
