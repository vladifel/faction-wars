/**
 * Turn-interaction write actions: casting votes, dispatching clues, and vetoes.
 *
 * Writes go straight to the primitive structures (`votes` ZSET, `clue`,
 * `has_voted` / `has_vetoed` hashes). The read path never touches these - it
 * reads the debounced snapshot instead (see snapshotService).
 */

import { redis } from '@devvit/web/server';
import type { ActiveClue, VisualFaction } from '../shared/types';
import { getPublicBoard } from './boardService';
import { EPHEMERAL_TTL_SECONDS, keys } from './keys';
import { incrFunnel } from './metricsService';
import { bumpStat } from './statsService';

export interface VoteResult {
  success: boolean;
  voteCount?: number;
  error?: string;
}

export interface ClueResult {
  success: boolean;
  error?: string;
}

export interface VoteInput {
  season: string;
  turn: number;
  subredditId: string;
  tileId: string;
  userId: string;
  /** Vote weight; shadowbanned callers pass 0 so their vote is silently
   * dropped while still appearing accepted to the client. */
  weight?: number;
}

/** Cast a single vote for a tile. Enforces one vote per user per turn. */
export async function castVote(input: VoteInput): Promise<VoteResult> {
  const { season, turn, tileId, userId, subredditId } = input;
  const weight = input.weight ?? 1;

  const board = await getPublicBoard(season, turn);
  if (!board) {
    return { success: false, error: 'No active board.' };
  }
  const tile = board.tiles.find((t) => t.id === tileId);
  if (!tile) {
    return { success: false, error: 'Invalid tile.' };
  }
  if (tile.isFlipped) {
    return { success: false, error: 'Tile already flipped.' };
  }

  const votedKey = keys.hasVoted(season, turn);
  const already = await redis.hGet(votedKey, userId);
  if (already) {
    return { success: false, error: 'Already voted this turn.' };
  }

  // Mark voted first so a duplicate concurrent request cannot double-count.
  await redis.hSet(votedKey, { [userId]: '1' });
  await redis.expire(votedKey, EPHEMERAL_TTL_SECONDS);

  let newCount: number | undefined;
  if (weight > 0) {
    const votesKey = keys.votes(season, turn);
    newCount = await redis.zIncrBy(votesKey, tileId, weight);
    await redis.expire(votesKey, EPHEMERAL_TTL_SECONDS);
  } else {
    newCount = (await redis.zScore(keys.votes(season, turn), tileId)) ?? 0;
  }

  await bumpStat(userId, 'votesCast', 1);
  await incrFunnel(subredditId, 'vote_cast');

  return { success: true, voteCount: newCount };
}

export interface ClueInput {
  season: string;
  turn: number;
  subredditId: string;
  faction: VisualFaction;
  userId: string;
  word: string;
  count: number;
}

/** Dispatch a coordinator clue for the active faction's turn. */
export async function dispatchClue(input: ClueInput): Promise<ClueResult> {
  const { season, turn, faction, userId, word, count, subredditId } = input;

  const clue: ActiveClue = {
    word: word.trim().toUpperCase(),
    count,
    faction,
    dispatchedBy: userId,
    dispatchedAt: Date.now(),
  };

  await redis.set(keys.clue(season, turn), JSON.stringify(clue));
  await redis.expire(keys.clue(season, turn), EPHEMERAL_TTL_SECONDS);
  // A fresh clue clears the prior veto tally for this turn window.
  await redis.del(keys.vetoes(season, turn));
  await redis.del(keys.hasVetoed(season, turn));

  await bumpStat(userId, 'cluesDispatched', 1);
  await incrFunnel(subredditId, 'clue_dispatched');

  return { success: true };
}

/** Read the active clue for a turn (or null). */
export async function getActiveClue(season: string, turn: number): Promise<ActiveClue | null> {
  const raw = await redis.get(keys.clue(season, turn));
  return raw ? (JSON.parse(raw) as ActiveClue) : null;
}

export interface VetoInput {
  season: string;
  turn: number;
  userId: string;
  /** Active (verified) player population of the vetoing faction. */
  activePlayers: number;
  vetoThreshold: number;
}

export interface VetoOutcome {
  accepted: boolean;
  clueDiscarded: boolean;
  vetoRatio: number;
}

/** Register a veto against the active clue. */
export async function vetoClue(input: VetoInput): Promise<VetoOutcome> {
  const { season, turn, userId, activePlayers, vetoThreshold } = input;

  const vetoedKey = keys.hasVetoed(season, turn);
  const already = await redis.hGet(vetoedKey, userId);
  if (already) {
    return { accepted: false, clueDiscarded: false, vetoRatio: 0 };
  }
  await redis.hSet(vetoedKey, { [userId]: '1' });
  await redis.expire(vetoedKey, EPHEMERAL_TTL_SECONDS);

  const vetoCount = await redis.incrBy(keys.vetoes(season, turn), 1);
  await redis.expire(keys.vetoes(season, turn), EPHEMERAL_TTL_SECONDS);

  const denom = Math.max(1, activePlayers);
  const vetoRatio = vetoCount / denom;
  const clueDiscarded = vetoRatio > vetoThreshold;

  if (clueDiscarded) {
    await redis.del(keys.clue(season, turn));
  }

  return { accepted: true, clueDiscarded, vetoRatio };
}
