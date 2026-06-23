/**
 * Typed Redis key builders.
 *
 * Every Redis key used by the app is constructed here so the schema lives in
 * exactly one place. Never inline raw key strings elsewhere - import these.
 */

import type { FactionId, FunnelStep, VisualFaction } from '../shared/types';

export const keys = {
  /** Persistent per-subreddit configuration (theme, words, pacing). JSON. */
  config: (subredditId: string): string => `config:subreddit:${subredditId}`,

  /** Staged theme modifications awaiting developer safety approval. JSON. */
  configPending: (subredditId: string): string =>
    `config:subreddit:${subredditId}:pending`,

  /** userId -> factionId map for a season. HASH. */
  factions: (season: string): string => `factions:season:${season}`,

  /** Verified active player counter per team. STRING (INCR/DECR). */
  factionCount: (faction: FactionId): string => `factions:count:${faction}`,

  /** Master board state for a turn (words + flipped tiles). JSON, 7d TTL. */
  boardPublic: (turn: TurnRef): string => `board:public:${turn}`,

  /** Hidden solution matrix for a season. JSON, server-only. */
  boardPrivate: (season: string): string => `board:private:${season}`,

  /** Pre-compiled flat read payload for UI polling. JSON, overwritten ~10s. */
  boardSnapshot: (turn: TurnRef): string => `board:snapshot:${turn}`,

  /** Ranked vote weight per tile_id. ZSET (ZINCRBY). */
  votes: (season: string, turn: number): string => `votes:${season}:${turn}`,

  /** userId -> boolean has-voted lookup, scoped per turn. HASH. */
  hasVoted: (season: string, turn: number): string => `has_voted:${season}:${turn}`,

  /** Per-turn veto tally for the active faction. STRING (INCR). */
  vetoes: (season: string, turn: number): string => `vetoes:${season}:${turn}`,

  /** userId -> boolean has-vetoed lookup, scoped per turn. HASH. */
  hasVetoed: (season: string, turn: number): string => `has_vetoed:${season}:${turn}`,

  /** The active clue for the current turn. JSON. */
  clue: (season: string, turn: number): string => `clue:${season}:${turn}`,

  /** Persistent cross-season meta-progression. JSON. */
  globalStats: (userId: string): string => `stats:global:${userId}`,

  /** Aggregated telemetry counters. STRING. */
  metricFunnel: (subredditId: string, step: FunnelStep): string =>
    `metric:funnel:${subredditId}:${step}`,

  // --- Index / pointer keys -------------------------------------------------

  /** Pointer to the season currently active for a subreddit. STRING. */
  activeSeason: (subredditId: string): string => `index:active_season:${subredditId}`,

  /** Pointer from a season to its current (live) turn number. STRING. */
  currentTurn: (season: string): string => `index:current_turn:${season}`,

  /** Pointer from a postId to the {season, turn} it represents. JSON. */
  postContext: (postId: string): string => `index:post:${postId}`,

  /** Coordinator claim per faction/turn. STRING (value = userId); claimed
   * atomically via `set(..., { nx: true })` so one commander wins per faction. */
  commander: (season: string, turn: number, faction: VisualFaction): string =>
    `commander:${season}:${turn}:${faction}`,

  /** Last N board fingerprints for a subreddit (JSON string[]). */
  recentBoards: (subredditId: string): string => `words:recent:${subredditId}`,

  /** Cached global word pool (JSON string[]). Shared across subreddits. */
  globalWordPool: (): string => 'words:global:pool',

  /** Idempotency guard — set when season win/loss stats are persisted. STRING. */
  seasonResultsRecorded: (season: string): string =>
    `stats:season_recorded:${season}`,
} as const;

/**
 * A turn is globally addressed by `{season}:{turn}` so a single string
 * uniquely identifies a board frame across seasons.
 */
export type TurnRef = `${string}:${number}`;

/** Build a TurnRef from its parts. */
export function turnRef(season: string, turn: number): TurnRef {
  return `${season}:${turn}` as TurnRef;
}

/** Default TTL (seconds) for ephemeral per-turn keys (7 days). */
export const EPHEMERAL_TTL_SECONDS = 7 * 24 * 60 * 60;
