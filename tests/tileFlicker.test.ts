import { describe, it, expect } from 'vitest';
import { pickFlickerTileIds } from '../src/client/tileFlicker';

describe('tileFlicker', () => {
  const ids = Array.from({ length: 25 }, (_, i) => `t${i}`);

  it('pickFlickerTileIds returns at most 2 ids', () => {
    for (let n = 0; n < 40; n++) {
      const picked = pickFlickerTileIds(ids);
      expect(picked.length).toBeGreaterThanOrEqual(1);
      expect(picked.length).toBeLessThanOrEqual(2);
      expect(new Set(picked).size).toBe(picked.length);
      for (const id of picked) expect(ids).toContain(id);
    }
  });

  it('pickFlickerTileIds returns empty for empty pool', () => {
    expect(pickFlickerTileIds([])).toEqual([]);
  });
});
