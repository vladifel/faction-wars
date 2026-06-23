/**
 * Shared endgame territory rules — used by server resolution and client stats.
 */

import { BOARD_TILE_COUNT, type PublicTile, type VisualFaction } from './types';

export interface TerritoryCounts {
  redCaptured: number;
  blueCaptured: number;
  emptyTiles: number;
  totalTiles: number;
}

export type TerritoryEndKind = 'stalemate' | 'majority';

export interface TerritoryEndResult {
  kind: TerritoryEndKind;
  winner?: VisualFaction;
}

/** Count flipped faction tiles and remaining empty slots. */
export function countTerritory(
  tiles: Pick<PublicTile, 'isFlipped' | 'revealedRole'>[],
): TerritoryCounts {
  let redCaptured = 0;
  let blueCaptured = 0;
  let emptyTiles = 0;

  for (const tile of tiles) {
    if (!tile.isFlipped) {
      emptyTiles++;
      continue;
    }
    if (tile.revealedRole === 'red') redCaptured++;
    else if (tile.revealedRole === 'blue') blueCaptured++;
  }

  return {
    redCaptured,
    blueCaptured,
    emptyTiles,
    totalTiles: tiles.length || BOARD_TILE_COUNT,
  };
}

/** Minimum faction captures before a mid-board majority can end the season. */
export const MAJORITY_MIN_CAPTURES = 4;

/**
 * Stalemate: board full, equal faction captures.
 * Majority: one faction holds >50% of revealed faction tiles (after min captures).
 */
export function evaluateTerritoryEnd(counts: TerritoryCounts): TerritoryEndResult | null {
  const { redCaptured, blueCaptured, emptyTiles } = counts;
  const factionCaptured = redCaptured + blueCaptured;

  if (emptyTiles === 0 && redCaptured === blueCaptured) {
    return { kind: 'stalemate' };
  }

  if (factionCaptured >= MAJORITY_MIN_CAPTURES) {
    if (redCaptured / factionCaptured > 0.5) {
      return { kind: 'majority', winner: 'red' };
    }
    if (blueCaptured / factionCaptured > 0.5) {
      return { kind: 'majority', winner: 'blue' };
    }
  }

  return null;
}

/** Viewer faction capture count. */
export function factionTilesCaptured(
  counts: TerritoryCounts,
  faction: VisualFaction,
): number {
  return faction === 'red' ? counts.redCaptured : counts.blueCaptured;
}

/** Board control % for a faction (0–100). */
export function factionEfficiencyPct(
  counts: TerritoryCounts,
  faction: VisualFaction,
): number {
  if (counts.totalTiles <= 0) return 0;
  return Math.round((factionTilesCaptured(counts, faction) / counts.totalTiles) * 100);
}

/** Format ms as `MM:SS` for the stats panel. */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
