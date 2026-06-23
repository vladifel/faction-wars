/**
 * Resolve the Reddit post that hosts the season's current (live) turn frame.
 *
 * Tombstones chain via `nextPostId` (+1 only). Players who missed several turns
 * need `livePostId` — a single hop to `index:current_turn` without walking the
 * tombstone chain.
 */

import { redis } from '@devvit/web/server';
import { getPublicBoard } from './boardService';
import { keys } from './keys';
import type { BoardSnapshot } from '../shared/types';

/** Post id for the season's current turn (ACTIVE or final RESOLVED frame). */
export async function getLivePostId(season: string): Promise<string | undefined> {
  const turnStr = await redis.get(keys.currentTurn(season));
  if (!turnStr) return undefined;
  const turn = parseInt(turnStr, 10);
  if (!Number.isFinite(turn)) return undefined;
  const board = await getPublicBoard(season, turn);
  return board?.postId;
}

/** Inject `livePostId` on resolved snapshots at read time (always fresh). */
export async function enrichSnapshotForClient(
  snap: BoardSnapshot,
): Promise<BoardSnapshot> {
  if (snap.status !== 'RESOLVED') return snap;
  const turnStr = await redis.get(keys.currentTurn(snap.season));
  const liveTurn = turnStr ? parseInt(turnStr, 10) : snap.turn;
  const livePostId = await getLivePostId(snap.season);
  if (!livePostId || livePostId === snap.postId) return snap;

  const ticker =
    Number.isFinite(liveTurn) && liveTurn > snap.turn
      ? `Turn ${snap.turn} ended. Turn ${liveTurn} is live — tap to jump.`
      : snap.ticker;

  return { ...snap, livePostId, ticker };
}

function redditPostUrl(subredditName: string, postId: string): string {
  const id = postId.replace(/^t3_/, '');
  return `https://reddit.com/r/${subredditName}/comments/${id}`;
}

function subredditListingUrl(subredditName: string): string {
  return `https://reddit.com/r/${subredditName}`;
}

/**
 * Pick RETRY destination after endgame: jump to mod's new war room when
 * `activeSeason` points at a different live post, otherwise subreddit feed.
 */
export async function resolveRetryNavigateUrl(opts: {
  subredditId: string;
  subredditName: string;
  currentPostId: string;
}): Promise<{ target: 'live_post' | 'subreddit'; navigateTo: string; postId?: string }> {
  const { subredditId, subredditName, currentPostId } = opts;
  const listing = subredditListingUrl(subredditName);

  const season = await redis.get(keys.activeSeason(subredditId));
  if (!season) {
    return { target: 'subreddit', navigateTo: listing };
  }

  const livePostId = await getLivePostId(season);
  if (!livePostId || livePostId === currentPostId) {
    return { target: 'subreddit', navigateTo: listing };
  }

  return {
    target: 'live_post',
    navigateTo: redditPostUrl(subredditName, livePostId),
    postId: livePostId,
  };
}
