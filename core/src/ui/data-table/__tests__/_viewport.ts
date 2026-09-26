/**
 * Test helper: make `window.matchMedia` answer width queries for a given
 * viewport width. Supports `(max-width: Npx)` and `(min-width: Npx)`, which is
 * all the data-table mobile hook uses.
 */
export function mockViewport(width: number): void {
  const evaluate = (query: string): boolean => {
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    if (max && width > Number(max[1])) return false;
    if (min && width < Number(min[1])) return false;
    return Boolean(max || min);
  };
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: evaluate(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
