import { describe, expect, it } from 'vitest';
import {
  getAlignCellClass,
  getAlignHeaderClass,
  type ColumnAlign,
} from '../column-meta';

describe('column alignment helpers', () => {
  describe('getAlignCellClass', () => {
    it('returns text-right for right alignment (used on <th>/<td>)', () => {
      expect(getAlignCellClass('right')).toBe('text-right');
    });

    it('returns text-center for center alignment', () => {
      expect(getAlignCellClass('center')).toBe('text-center');
    });

    it('returns empty string for left alignment (the default)', () => {
      expect(getAlignCellClass('left')).toBe('');
    });

    it('returns empty string when align is undefined (backward compat)', () => {
      expect(getAlignCellClass(undefined)).toBe('');
    });
  });

  describe('getAlignHeaderClass', () => {
    it('returns justify-end for right alignment (flex wrapper inside header)', () => {
      expect(getAlignHeaderClass('right')).toBe('justify-end');
    });

    it('returns justify-center for center alignment', () => {
      expect(getAlignHeaderClass('center')).toBe('justify-center');
    });

    it('returns empty string for left alignment', () => {
      expect(getAlignHeaderClass('left')).toBe('');
    });

    it('returns empty string when align is undefined', () => {
      expect(getAlignHeaderClass(undefined)).toBe('');
    });
  });

  it('ColumnAlign type accepts left | center | right', () => {
    // Compile-time check: this should typecheck without error.
    const valid: ColumnAlign[] = ['left', 'center', 'right'];
    expect(valid).toHaveLength(3);
  });
});
