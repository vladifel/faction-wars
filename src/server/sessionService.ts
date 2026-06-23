/**
 * Session bootstrap & identity resolution.
 *
 * Turns the request `context` into everything the route machine needs: the
 * season/turn this post is bound to, the resolved config, the viewer's faction
 * + trust, commander status, and the initial snapshot. Also performs lazy turn
 * resolution so an expired post self-heals on first view.
 */

import { context, redis } from '@devvit/web/server';
import { isDevPlaytest } from './devMode';
import type { ClientSession } from '../shared/api';
import type { GameStatus, SubConfig, VisualFaction } from '../shared/types';
import { createAndPersistBoard, getPublicBoard } from './boardService';
import { getSubConfig } from './config';
import {
  assignFaction,
  getAssignedFaction,
  getFactionCounts,
  visualFactionFor,
} from './factionService';
import { EPHEMERAL_TTL_SECONDS, keys } from './keys';
import { incrFunnel } from './metricsService';
import { readSnapshot } from './snapshotService';
import { ensureTurnFresh, type SpawnNextPost } from './turnService';
import { getPlayerStatsSummary } from './statsService';

export interface PostBinding {
  season: string;
  turn: number;
  fresh: boolean;
}

/** Resolve (or initialize) the season/turn a given post represents. */
export async function getOrInitSession(opts: {
  subredditId: string;
  postId: string;
  config: SubConfig;
}): Promise<PostBinding> {
  const { subredditId, postId, config } = opts;

  const raw = await redis.get(keys.postContext(postId));
  if (raw) {
    const { season, turn } = JSON.parse(raw) as { season: string; turn: number };
    return { season, turn, fresh: false };
  }

  // First view of a brand-new post: open a season anchored to this post id.
  const season = `s_${postId}`;
  await redis.set(keys.activeSeason(subredditId), season);
  await createAndPersistBoard({ season, turn: 1, postId, config });
  return { season, turn: 1, fresh: true };
}

/** Who, if anyone, holds the coordinator role for a faction this turn. */
export async function getCommander(
  season: string,
  turn: number,
  faction: VisualFaction,
): Promise<string | null> {
  const v = await redis.get(keys.commander(season, turn, faction));
  return v ?? null;
}

/** Atomically claim the coordinator role via `set` with `nx`, then read back. */
export async function claimCommander(opts: {
  season: string;
  turn: number;
  faction: VisualFaction;
  userId: string;
}): Promise<boolean> {
  const { season, turn, faction, userId } = opts;
  const key = keys.commander(season, turn, faction);
  await redis.set(key, userId, {
    nx: true,
    expiration: new Date(Date.now() + EPHEMERAL_TTL_SECONDS * 1000),
  });
  const holder = await redis.get(key);
  return holder === userId;
}

/** Assemble the full client session bundle for the current render/request. */
export async function buildSessionBundle(
  spawnNextPost?: SpawnNextPost,
): Promise<ClientSession> {
  const subredditId = context.subredditId;
  const postId = context.postId;
  const userId = context.userId;

  const base: ClientSession = {
    ok: false,
    postId: postId ?? '',
    season: '',
    turn: 0,
    config: undefined as never,
    status: 'ACTIVE',
    snapshot: null,
    visualFaction: 'red',
    trusted: false,
    voteWeight: 0,
    factionPopulation: 0,
    isCommander: false,
    isActiveFaction: false,
    loggedIn: !!userId,
  };

  if (!subredditId || !postId) {
    return { ...base, error: 'Missing post context.' };
  }

  try {
    const config = await getSubConfig(subredditId);
    const binding = await getOrInitSession({ subredditId, postId, config });

    // Lazy evaluation: resolve this post's turn inline if its clock expired.
    await ensureTurnFresh({
      season: binding.season,
      turn: binding.turn,
      config,
      spawnNextPost,
    });

    const board = await getPublicBoard(binding.season, binding.turn);
    const snapshot = await readSnapshot({ season: binding.season, turn: binding.turn });
    const status: GameStatus = board?.status ?? 'ACTIVE';
    const currentFaction = board?.currentFaction ?? 'red';

    // Identity + trust.
    const join = await assignFaction({
      season: binding.season,
      subredditId,
      userId,
      trust: config.trust,
    });
    const stored = userId ? await getAssignedFaction(binding.season, userId) : null;
    const assigned = stored ? visualFactionFor(stored, userId!) : join.visualFaction;

    // Playtest override: pin the lone tester onto the moving faction + trust them
    // so the board is interactive every turn. Never active in production.
    const dev = isDevPlaytest() && !!userId;
    const visualFaction = dev ? currentFaction : assigned;
    const trusted = dev ? true : join.trusted;

    const counts = await getFactionCounts();
    const factionPopulation = visualFaction === 'red' ? counts.red : counts.blue;

    const isActiveFaction = dev ? true : visualFaction === currentFaction;
    const isCommander =
      !!userId &&
      (await getCommander(binding.season, binding.turn, visualFaction)) === userId;

    await incrFunnel(subredditId, 'post_view');

    const playerStats = await getPlayerStatsSummary(userId);

    return {
      ok: true,
      postId,
      season: binding.season,
      turn: binding.turn,
      config,
      status,
      snapshot,
      visualFaction,
      trusted,
      voteWeight: trusted ? 1 : 0,
      factionPopulation,
      isCommander,
      isActiveFaction,
      loggedIn: !!userId,
      playerStats,
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : 'Failed to load game.',
    };
  }
}
