import { describe, expect, it } from 'vitest';
import { endgameVariantToState, resolveEndgameVariant } from '../src/client/endgame';
import type { BoardSnapshot } from '../src/shared/types';

function snap(partial: Partial<BoardSnapshot>): BoardSnapshot {
  return {
    season: 's_test',
    turn: 1,
    postId: 't3_x',
    status: 'RESOLVED',
    currentFaction: 'red',
    scores: { red: 0, blue: 5 },
    tiles: [],
    ticker: '',
    ...partial,
  };
}

describe('resolveEndgameVariant', () => {
  it('returns null when season has not ended', () => {
    expect(resolveEndgameVariant(snap({ seasonEnded: false }), 'red')).toBeNull();
    expect(resolveEndgameVariant(snap({}), 'red')).toBeNull();
  });

  it('maps assassin end reason to glitch for losers', () => {
    expect(
      resolveEndgameVariant(
        snap({ seasonEnded: true, endReason: 'assassin', winner: 'blue' }),
        'red',
      ),
    ).toBe('assassin');
  });

  it('maps assassin end reason to victory for winner faction', () => {
    expect(
      resolveEndgameVariant(
        snap({ seasonEnded: true, endReason: 'assassin', winner: 'blue' }),
        'blue',
      ),
    ).toBe('victory');
  });

  it('maps stalemate end reason', () => {
    expect(
      resolveEndgameVariant(snap({ seasonEnded: true, endReason: 'stalemate' }), 'red'),
    ).toBe('stalemate');
  });

  it('maps victory for viewer faction', () => {
    expect(
      resolveEndgameVariant(
        snap({ seasonEnded: true, endReason: 'tiles', winner: 'red' }),
        'red',
      ),
    ).toBe('victory');
  });

  it('maps defeat when viewer lost', () => {
    expect(
      resolveEndgameVariant(
        snap({ seasonEnded: true, endReason: 'tiles', winner: 'blue' }),
        'red',
      ),
    ).toBe('defeat');
  });
});

describe('endgameVariantToState', () => {
  it('maps variants to arcade overlay states', () => {
    expect(endgameVariantToState('victory')).toBe('WIN');
    expect(endgameVariantToState('defeat')).toBe('LOSS');
    expect(endgameVariantToState('assassin')).toBe('GLITCH');
    expect(endgameVariantToState('stalemate')).toBe('STALEMATE');
  });
});
