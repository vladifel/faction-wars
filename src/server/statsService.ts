/**
 * Persistent cross-season player stats (`stats:global:{userId}`).
 *
 * Used for meta-progression (streaks, trophies) and scrubbed by the GDPR pipe.
 * All writes are best-effort and read-modify-write on a single JSON blob.
 */

import { redis } from '@devvit/web/server';
import type { GlobalStats, PlayerStatsSummary, SeasonEndReason, VisualFaction } from '../shared/types';
import { keys } from './keys';
import { defaultGlobalStats, parseAndMigrate } from './migrations';
import { visualFactionFor } from './factionService';

/** Numeric counter fields that `bumpStat` may increment. */
type CounterField = 'wins' | 'losses' | 'votesCast' | 'cluesDispatched';

async function readStats(userId: string): Promise<GlobalStats> {
  const raw = await redis.get(keys.globalStats(userId));
  const parsed = parseAndMigrate<GlobalStats>(raw);
  if (parsed) return parsed.value;
  return defaultGlobalStats(userId, userId);
}

async function writeStats(stats: GlobalStats): Promise<void> {
  await redis.set(keys.globalStats(stats.userId), JSON.stringify(stats));
}

/** Increment a numeric counter on a user's stats. */
export async function bumpStat(
  userId: string,
  field: CounterField,
  by = 1,
): Promise<void> {
  try {
    const stats = await readStats(userId);
    if (stats.redacted) return; // never resurrect scrubbed records
    stats[field] += by;
    await writeStats(stats);
  } catch {
    // Stats are non-critical to gameplay.
  }
}

/** Record a win/loss and update streaks for a user. */
export async function recordResult(userId: string, won: boolean): Promise<void> {
  try {
    const stats = await readStats(userId);
    if (stats.redacted) return;
    if (won) {
      stats.wins += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
      stats.losses += 1;
      stats.currentStreak = 0;
    }
    await writeStats(stats);
  } catch {
    /* non-critical */
  }
}

/** Read client-safe career stats for the session bootstrap. */
export async function getPlayerStatsSummary(
  userId: string | undefined,
): Promise<PlayerStatsSummary | undefined> {
  if (!userId) return undefined;
  try {
    const stats = await readStats(userId);
    if (stats.redacted) return undefined;
    return {
      wins: stats.wins,
      losses: stats.losses,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
    };
  } catch {
    return undefined;
  }
}

/**
 * Persist win/loss stats for every verified season participant once.
 * Shadowbanned players are skipped. Stalemate counts as a loss (streak reset).
 */
export async function recordSeasonResults(opts: {
  season: string;
  winner?: VisualFaction;
  endReason: SeasonEndReason;
}): Promise<void> {
  try {
    const claimed = await redis.set(keys.seasonResultsRecorded(opts.season), '1', { nx: true });
    if (claimed == null) return;

    const roster = await redis.hGetAll(keys.factions(opts.season));
    const entries = Object.entries(roster);
    if (entries.length === 0) return;

    const stalemate = opts.endReason === 'stalemate' || opts.winner === undefined;

    await Promise.all(
      entries.map(async ([userId, factionId]) => {
        if (factionId !== 'red' && factionId !== 'blue') return;
        const visual = visualFactionFor(factionId, userId);
        const won = !stalemate && visual === opts.winner;
        await recordResult(userId, won);
      }),
    );
  } catch {
    /* non-critical */
  }
}

/** GDPR scrub: strip identifying metadata but keep aggregate counters. */
export async function redactUser(userId: string): Promise<void> {
  const stats = await readStats(userId);
  const scrubbed: GlobalStats = {
    ...stats,
    username: '[Deleted User]',
    trophies: [],
    redacted: true,
  };
  await writeStats(scrubbed);
}
