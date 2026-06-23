import { describe, expect, it } from 'vitest';
import {
  countTerritory,
  evaluateTerritoryEnd,
  factionEfficiencyPct,
  formatElapsed,
  MAJORITY_MIN_CAPTURES,
} from '../src/shared/endgameLogic';
import type { PublicTile } from '../src/shared/types';

function tile(
  id: string,
  flipped: boolean,
  role?: PublicTile['revealedRole'],
): PublicTile {
  return {
    id,
    word: id,
    voteCount: 0,
    isFlipped: flipped,
    ...(flipped && role ? { revealedRole: role } : {}),
  };
}

describe('countTerritory', () => {
  it('counts empty and captured faction tiles', () => {
    const counts = countTerritory([
      tile('a', true, 'red'),
      tile('b', true, 'blue'),
      tile('c', false),
    ]);
    expect(counts.redCaptured).toBe(1);
    expect(counts.blueCaptured).toBe(1);
    expect(counts.emptyTiles).toBe(1);
    expect(counts.totalTiles).toBe(3);
  });
});

describe('evaluateTerritoryEnd', () => {
  it('detects stalemate when board is full with equal captures', () => {
    const tiles = [
      ...Array.from({ length: 4 }, (_, i) => tile(`r${i}`, true, 'red')),
      ...Array.from({ length: 4 }, (_, i) => tile(`b${i}`, true, 'blue')),
      tile('n', true, 'neutral'),
    ];
    const result = evaluateTerritoryEnd(countTerritory(tiles));
    expect(result).toEqual({ kind: 'stalemate' });
  });

  it('detects majority when one faction holds >50% of captured faction tiles', () => {
    const tiles = Array.from({ length: MAJORITY_MIN_CAPTURES + 1 }, (_, i) =>
      tile(`r${i}`, true, 'red'),
    );
    tiles.push(tile('b0', true, 'blue'));
    const result = evaluateTerritoryEnd(countTerritory(tiles));
    expect(result).toEqual({ kind: 'majority', winner: 'red' });
  });

  it('does not majority-win on the first single capture', () => {
    const result = evaluateTerritoryEnd(countTerritory([tile('r0', true, 'red')]));
    expect(result).toBeNull();
  });
});

describe('formatElapsed', () => {
  it('formats mm:ss', () => {
    expect(formatElapsed(125_000)).toBe('02:05');
  });
});

describe('factionEfficiencyPct', () => {
  it('returns board control percentage', () => {
    const counts = countTerritory([
      tile('r0', true, 'red'),
      tile('r1', true, 'red'),
      tile('x', false),
      tile('y', false),
    ]);
    expect(factionEfficiencyPct(counts, 'red')).toBe(50);
  });
});
