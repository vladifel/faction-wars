/**
 * Trust gate & faction assignment (Sybil resistance).
 *
 * New accounts are screened for age/karma. Untrusted accounts are silently
 * marked `shadowbanned` and shown a believable fake team so bots cannot tell
 * their sabotage is being ignored. Trusted accounts are balanced across teams
 * using an optimistic-locking WATCH/MULTI/EXEC retry loop on the count keys.
 */

import { redis, reddit } from '@devvit/web/server';
import type {
  FactionId,
  JoinResult,
  TrustConfig,
  VisualFaction,
} from '../shared/types';
import { keys } from './keys';
import { incrFunnel } from './metricsService';

const MAX_TXN_RETRIES = 8;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Stable, deterministic fake-team derivation for shadowbanned users. */
function stableVisualFaction(userId: string): VisualFaction {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? 'red' : 'blue';
}

/** Resolve the team to display given the stored faction + userId. */
export function visualFactionFor(faction: FactionId, userId: string): VisualFaction {
  if (faction === 'red' || faction === 'blue') return faction;
  return stableVisualFaction(userId);
}

/** Read the verified player counts for both factions. */
export async function getFactionCounts(): Promise<{ red: number; blue: number }> {
  const [redStr, blueStr] = await Promise.all([
    redis.get(keys.factionCount('red')),
    redis.get(keys.factionCount('blue')),
  ]);
  return {
    red: parseInt(redStr ?? '0', 10),
    blue: parseInt(blueStr ?? '0', 10),
  };
}

/** Fast-path read of an already-assigned faction (no writes). */
export async function getAssignedFaction(
  season: string,
  userId: string,
): Promise<FactionId | null> {
  const stored = await redis.hGet(keys.factions(season), userId);
  return (stored as FactionId | undefined) ?? null;
}

/** Whether an account clears the trust gate. */
async function isTrustedAccount(userId: string, trust: TrustConfig): Promise<boolean> {
  try {
    const user = await reddit.getUserById(userId as `t2_${string}`);
    if (!user) return false;
    const ageDays = (Date.now() - user.createdAt.getTime()) / MS_PER_DAY;
    const karma = (user.linkKarma ?? 0) + (user.commentKarma ?? 0);
    return ageDays >= trust.minAccountAgeDays && karma >= trust.minKarma;
  } catch {
    // If the profile lookup fails we err on the side of suppression.
    return false;
  }
}

/**
 * Ensure the user has a faction for the season. Idempotent: repeated calls
 * return the existing assignment without re-running the gate.
 */
export async function assignFaction(opts: {
  season: string;
  subredditId: string;
  userId: string | undefined;
  trust: TrustConfig;
}): Promise<JoinResult> {
  const { season, subredditId, trust, userId } = opts;
  if (!userId) {
    return { visualFaction: 'red', trusted: false };
  }

  // --- Fast path: already assigned -----------------------------------------
  const existing = await getAssignedFaction(season, userId);
  if (existing) {
    return {
      visualFaction: visualFactionFor(existing, userId),
      trusted: existing !== 'shadowbanned',
    };
  }

  // --- Trust gate ----------------------------------------------------------
  const trusted = await isTrustedAccount(userId, trust);
  if (!trusted) {
    await redis.hSet(keys.factions(season), {
      [userId]: 'shadowbanned' satisfies FactionId,
    });
    return { visualFaction: stableVisualFaction(userId), trusted: false };
  }

  // --- Verified: balance teams under optimistic lock -----------------------
  const redKey = keys.factionCount('red');
  const blueKey = keys.factionCount('blue');

  for (let attempt = 0; attempt < MAX_TXN_RETRIES; attempt++) {
    const txn = await redis.watch(redKey, blueKey);

    const [redStr, blueStr] = await Promise.all([redis.get(redKey), redis.get(blueKey)]);
    const red = parseInt(redStr ?? '0', 10);
    const blue = parseInt(blueStr ?? '0', 10);

    const chosen: VisualFaction =
      red === blue ? (Math.random() < 0.5 ? 'red' : 'blue') : red < blue ? 'red' : 'blue';

    await txn.multi();
    await txn.hSet(keys.factions(season), { [userId]: chosen });
    await txn.incrBy(keys.factionCount(chosen), 1);
    const result = await txn.exec();

    if (result != null) {
      await incrFunnel(subredditId, 'faction_assigned');
      return { visualFaction: chosen, trusted: true };
    }
  }

  // Exhausted retries under heavy contention: assign without the counter.
  await redis.hSet(keys.factions(season), { [userId]: stableVisualFaction(userId) });
  return { visualFaction: stableVisualFaction(userId), trusted: true };
}
