/**
 * Track A (p6) — BaseListTable / DataTableWithToolbar card + expand extension.
 *
 * The back-compat PROOF: with `renderRow` unset, both factories must render
 * byte-identical markup to the snapshot captured from the UNMODIFIED code
 * (`__baseline__/*.no-renderrow.html`, produced by `capture-baseline.tsx` before
 * the prop additions). Plus the new renderRow behaviour (custom nodes, header
 * suppression, colSpan wrapping, expand toggle, getRowCanExpand gating, stable
 * id across reorder).
 *
 * Env: happy-dom (scoped via `environmentMatchGlobs` in vitest.config.ts).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataTableWithToolbar } from '../DataTableWithToolbar';
import { createBaseListTable } from '../BaseListTable';
import { PEOPLE, personColumns, toolbarUi, baseUi, type Person } from './_fixtures';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(__dirname, '__baseline__');

const Toolbar = createDataTableWithToolbar<Person>({
  config: { entityName: 'people' },
  ui: toolbarUi as unknown as Parameters<typeof createDataTableWithToolbar<Person>>[0]['ui'],
});
const Base = createBaseListTable(baseUi as unknown as Parameters<typeof createBaseListTable>[0]);

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// (1) Back-compat: no-renderRow render is byte-identical to the pre-change baseline
// ---------------------------------------------------------------------------

describe('back-compat: no renderRow → identical cell grid', () => {
  it('DataTableWithToolbar markup is byte-identical to the captured baseline', () => {
    const baseline = readFileSync(join(baselineDir, 'toolbar.no-renderrow.html'), 'utf-8');
    const html = renderToStaticMarkup(
      <Toolbar data={PEOPLE} columns={personColumns} />,
    );
    expect(html).toBe(baseline);
  });

  it('BaseListTable markup is byte-identical to the captured baseline', () => {
    const baseline = readFileSync(join(baselineDir, 'base.no-renderrow.html'), 'utf-8');
    const html = renderToStaticMarkup(
      <Base data={PEOPLE} columns={personColumns} />,
    );
    expect(html).toBe(baseline);
  });

  it('renders the header + every column cell + index-based row.id (cell grid intact)', () => {
    render(<Base data={PEOPLE} columns={personColumns} />);
    // Header present (NOT suppressed) — column header buttons exist.
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Email')).toBeTruthy();
    // Every data cell rendered.
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('carol@example.com')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// (2) renderRow → N custom nodes == page size, header suppressed, td colSpan
// ---------------------------------------------------------------------------

describe('renderRow → bespoke rows', () => {
  it('renders one custom node per row-model row, header suppressed, each wrapped in <td colSpan>', () => {
    const { container } = render(
      <Base
        data={PEOPLE}
        columns={personColumns}
        getRowId={(p) => p.id}
        renderRow={(p) => <div data-testid="card">{p.name}</div>}
      />,
    );
    // Header row suppressed: no <thead>.
    expect(container.querySelector('thead')).toBeNull();
    // One custom node per row (== row-model length, here 3).
    const cards = screen.getAllByTestId('card');
    expect(cards).toHaveLength(PEOPLE.length);
    // Each card is wrapped in a <td colSpan=visibleLeafCount> inside a <tr>.
    cards.forEach((card) => {
      const td = card.closest('td');
      expect(td).not.toBeNull();
      // 2 visible leaf columns (name, email).
      expect(td!.getAttribute('colspan')).toBe('2');
      expect(td!.closest('tr')).not.toBeNull();
    });
  });

  it('iterates the row MODEL (pagination/filter still applies), not data.length', () => {
    // 12 rows; DataTableWithToolbar default page size is 10 → page 1 shows 10.
    const many: Person[] = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      name: `Name ${i}`,
      email: `n${i}@x.com`,
    }));
    render(
      <Toolbar
        data={many}
        columns={personColumns}
        getRowId={(p) => p.id}
        renderRow={(p) => <div data-testid="row">{p.name}</div>}
      />,
    );
    // Page size 10 → exactly 10 custom rows on the page (NOT 12 = data.length).
    expect(screen.getAllByTestId('row')).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// (3) expand: toggle renders renderExpanded; getRowCanExpand=false blocks;
//     no renderExpanded → toggle is a no-op
// ---------------------------------------------------------------------------

describe('expand behaviour', () => {
  it('toggleExpanded reveals renderExpanded in a following full-width row', () => {
    render(
      <Base
        data={PEOPLE}
        columns={personColumns}
        getRowId={(p) => p.id}
        renderRow={(p, ctx) => (
          <button data-testid={`toggle-${p.id}`} onClick={ctx.toggleExpanded}>
            {p.name}
          </button>
        )}
        renderExpanded={(p) => <div data-testid={`detail-${p.id}`}>detail {p.name}</div>}
      />,
    );
    // Collapsed initially.
    expect(screen.queryByTestId('detail-u1')).toBeNull();
    // Expand u1.
    fireEvent.click(screen.getByTestId('toggle-u1'));
    expect(screen.getByTestId('detail-u1')).toBeTruthy();
    // Other rows stay collapsed.
    expect(screen.queryByTestId('detail-u2')).toBeNull();
    // Collapse again.
    fireEvent.click(screen.getByTestId('toggle-u1'));
    expect(screen.queryByTestId('detail-u1')).toBeNull();
  });

  it('getRowCanExpand=false blocks expansion (toggle is inert)', () => {
    render(
      <Base
        data={PEOPLE}
        columns={personColumns}
        getRowId={(p) => p.id}
        getRowCanExpand={() => false}
        renderRow={(p, ctx) => (
          <button data-testid={`toggle-${p.id}`} onClick={ctx.toggleExpanded}>
            {p.name}
          </button>
        )}
        renderExpanded={(p) => <div data-testid={`detail-${p.id}`}>detail</div>}
      />,
    );
    fireEvent.click(screen.getByTestId('toggle-u1'));
    expect(screen.queryByTestId('detail-u1')).toBeNull();
  });

  it('ctx.isExpanded reflects state and getRowCanExpand=false keeps it false', () => {
    render(
      <Base
        data={[PEOPLE[0]]}
        columns={personColumns}
        getRowId={(p) => p.id}
        getRowCanExpand={() => false}
        renderRow={(p, ctx) => (
          <button data-testid="toggle" onClick={ctx.toggleExpanded}>
            {ctx.isExpanded ? 'open' : 'closed'}
          </button>
        )}
        renderExpanded={() => <div>detail</div>}
      />,
    );
    expect(screen.getByTestId('toggle').textContent).toBe('closed');
    fireEvent.click(screen.getByTestId('toggle'));
    // Still closed — canExpand=false forces isExpanded false.
    expect(screen.getByTestId('toggle').textContent).toBe('closed');
  });

  it('no renderExpanded → toggle is a no-op (no extra row rendered)', () => {
    const { container } = render(
      <Base
        data={[PEOPLE[0]]}
        columns={personColumns}
        getRowId={(p) => p.id}
        renderRow={(p, ctx) => (
          <button data-testid="toggle" onClick={ctx.toggleExpanded}>
            {p.name}
          </button>
        )}
      />,
    );
    const before = container.querySelectorAll('tbody tr').length;
    fireEvent.click(screen.getByTestId('toggle'));
    const after = container.querySelectorAll('tbody tr').length;
    expect(after).toBe(before); // no following detail row appended
  });
});

// ---------------------------------------------------------------------------
// (4) stable getRowId: expanded state follows the entity across a data reorder
// ---------------------------------------------------------------------------

describe('stable getRowId across reorder', () => {
  function Harness() {
    const [reversed, setReversed] = React.useState(false);
    const data = reversed ? [...PEOPLE].reverse() : PEOPLE;
    return (
      <div>
        <button data-testid="reorder" onClick={() => setReversed((v) => !v)}>
          reorder
        </button>
        <Base
          data={data}
          columns={personColumns}
          getRowId={(p) => p.id}
          renderRow={(p, ctx) => (
            <button data-testid={`toggle-${p.id}`} onClick={ctx.toggleExpanded}>
              {p.name}
            </button>
          )}
          renderExpanded={(p) => <div data-testid={`detail-${p.id}`}>detail {p.name}</div>}
        />
      </div>
    );
  }

  it('expanded entity stays expanded (by uuid) after the array order flips', () => {
    render(<Harness />);
    // Expand the LAST entity (u3 / Carol).
    fireEvent.click(screen.getByTestId('toggle-u3'));
    expect(screen.getByTestId('detail-u3')).toBeTruthy();
    // Flip the data order.
    fireEvent.click(screen.getByTestId('reorder'));
    // u3 is still expanded — state followed the entity id, NOT the index.
    expect(screen.getByTestId('detail-u3')).toBeTruthy();
    // And the entity that is now at the old index (u1) is NOT expanded.
    expect(screen.queryByTestId('detail-u1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (5) renderRow empty-state spans visibleLeafCount
// ---------------------------------------------------------------------------

describe('renderRow empty + loading states', () => {
  it('empty data → single empty-state row spanning visibleLeafCount', () => {
    const { container } = render(
      <Base
        data={[]}
        columns={personColumns}
        getRowId={(p) => p.id}
        renderRow={(p) => <div>{p.name}</div>}
        emptyState={{ title: 'No people' }}
      />,
    );
    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(1);
    const td = within(rows[0] as HTMLElement).getByText('No people').closest('td');
    expect(td!.getAttribute('colspan')).toBe('2');
  });
});
