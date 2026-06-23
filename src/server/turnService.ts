/**
 * Turn resolution & self-healing state machine.
 *
 * - Tallies the votes ZSET, flips the winning tile against the solution.
 * - Applies Codenames outcomes (own tile / opponent tile / neutral / assassin).
 * - Runs the consecutive-veto strike penalty.
 * - `ensureTurnFresh` implements lazy evaluation: any read/write past
 *   `turn_end_time` resolves the turn inline so a dropped CRON never deadlocks
 *   the game.
 */

import {
  type SolutionTile,
  type SeasonEndReason,
  type SubConfig,
  type TileRole,
  type VisualFaction,
} from '../shared/types';
import { evaluateTerritoryEnd, countTerritory } from '../shared/endgameLogic';
import { redis } from '@devvit/web/server';
import {
  createAndPersistBoard,
  getPrivateBoard,
  getPublicBoard,
  randomUnflippedNeutral,
  writePublicBoard,
} from './boardService';
import { keys } from './keys';
import { compileSnapshot } from './snapshotService';
import { broadcastUpdate } from './realtimeService';
import { recordSeasonResults } from './statsService';

const STRIKE_LIMIT = 2;

export type ResolveReason = 'vote' | 'no_votes' | 'assassin' | 'strike_penalty';

export interface ResolveResult {
  resolved: boolean;
  gameOver: boolean;
  winner?: VisualFaction;
  flippedTileId?: string;
  flippedRole?: TileRole;
  nextTurn: number;
  nextFaction: VisualFaction;
  reason: ResolveReason;
}

/** Callback that spawns the post hosting the next turn and returns its id. */
export type SpawnNextPost = (args: {
  season: string;
  nextTurn: number;
  prevPostId: string;
}) => Promise<string>;

function other(faction: VisualFaction): VisualFaction {
  return faction === 'red' ? 'blue' : 'red';
}

/** Highest-weighted tile id in the votes ZSET, or undefined if no votes. */
async function getTopVotedTile(season: string, turn: number): Promise<string | undefined> {
  const res = await redis.zRange(keys.votes(season, turn), 0, 0, {
    reverse: true,
    by: 'rank',
  });
  return res.length > 0 ? res[0]!.member : undefined;
}

function roleOf(solution: SolutionTile[], tileId: string): TileRole | undefined {
  return solution.find((s) => s.id === tileId)?.role;
}

/** Resolve the current turn and advance to the next. Idempotent. */
export async function resolveAndAdvance(opts: {
  season: string;
  turn: number;
  config: SubConfig;
  forceReason?: Extract<ResolveReason, 'strike_penalty'>;
  spawnNextPost?: SpawnNextPost;
}): Promise<ResolveResult | null> {
  const { season, turn, config, forceReason, spawnNextPost } = opts;

  const board = await getPublicBoard(season, turn);
  const priv = await getPrivateBoard(season);
  if (!board || !priv) return null;
  if (board.status === 'RESOLVED') return null;

  const solution = priv.solution;
  const current = board.currentFaction;

  // --- Pick the tile to flip ----------------------------------------------
  let flippedTileId: string | undefined;
  let reason: ResolveReason;

  if (forceReason === 'strike_penalty') {
    flippedTileId = randomUnflippedNeutral(board, solution);
    reason = 'strike_penalty';
  } else {
    flippedTileId = await getTopVotedTile(season, turn);
    reason = flippedTileId ? 'vote' : 'no_votes';
  }

  let gameOver = false;
  let winner: VisualFaction | undefined;
  let flippedRole: TileRole | undefined;

  if (flippedTileId) {
    const tile = board.tiles.find((t) => t.id === flippedTileId);
    flippedRole = roleOf(solution, flippedTileId);
    if (tile && flippedRole) {
      tile.isFlipped = true;
      tile.revealedRole = flippedRole;

      switch (flippedRole) {
        case 'assassin':
          gameOver = true;
          winner = other(current);
          reason = 'assassin';
          break;
        case 'red':
          board.scores.red = Math.max(0, board.scores.red - 1);
          break;
        case 'blue':
          board.scores.blue = Math.max(0, board.scores.blue - 1);
          break;
        case 'neutral':
        default:
          break;
      }
    }
  }

  if (!gameOver) {
    const territoryEnd = evaluateTerritoryEnd(countTerritory(board.tiles));
    if (territoryEnd) {
      gameOver = true;
      if (territoryEnd.kind === 'stalemate') {
        winner = undefined;
      } else {
        winner = territoryEnd.winner;
      }
    } else if (board.scores.red === 0) {
      gameOver = true;
      winner = 'red';
    } else if (board.scores.blue === 0) {
      gameOver = true;
      winner = 'blue';
    }
  }

  let seasonEndReason: SeasonEndReason = 'tiles';
  if (reason === 'assassin') {
    seasonEndReason = 'assassin';
  } else if (gameOver && winner === undefined) {
    seasonEndReason = 'stalemate';
  } else if (gameOver && winner) {
    const territoryEnd = evaluateTerritoryEnd(countTerritory(board.tiles));
    seasonEndReason = territoryEnd?.kind === 'majority' ? 'majority' : 'tiles';
  }

  const nextFaction = other(current);
  const nextTurn = turn + 1;

  // --- Persist the resolved (now historical) frame -------------------------
  board.status = 'RESOLVED';
  await writePublicBoard(board);

  if (gameOver) {
    board.seasonEnded = true;
    board.winner = winner;
    board.endReason = seasonEndReason;
    await writePublicBoard(board);
    await redis.set(keys.currentTurn(season), String(turn));
    await compileSnapshot({ season, turn });
    await recordSeasonResults({
      season,
      winner,
      endReason: seasonEndReason,
    });
    await broadcastUpdate(board.postId, {
      type: 'resolved',
      turn,
      versionHash: 'gameover',
    });
    return {
      resolved: true,
      gameOver: true,
      winner,
      flippedTileId,
      flippedRole,
      nextTurn,
      nextFaction,
      reason,
    };
  }

  // --- Spawn the next turn frame -------------------------------------------
  const nextPostId = spawnNextPost
    ? await spawnNextPost({ season, nextTurn, prevPostId: board.postId })
    : board.postId; // single-post fallback: same post evolves

  board.nextPostId = nextPostId;
  await writePublicBoard(board);

  await createAndPersistBoard({
    season,
    turn: nextTurn,
    postId: nextPostId,
    config,
    carryOver: {
      tiles: board.tiles,
      solution,
      startingFaction: priv.startingFaction,
    },
  });
  // The carried board keeps the *current* faction for the new mover.
  const nextBoard = await getPublicBoard(season, nextTurn);
  if (nextBoard) {
    nextBoard.currentFaction = nextFaction;
    await writePublicBoard(nextBoard);
  }

  await compileSnapshot({ season, turn });
  const nextSnap = await compileSnapshot({ season, turn: nextTurn });

  // Tell the old post to redirect, and (when same-post) push the fresh board.
  await broadcastUpdate(board.postId, {
    type: 'resolved',
    turn,
    versionHash: nextSnap?.versionHash ?? 'resolved',
    nextPostId,
    livePostId: nextPostId,
  });
  if (nextPostId !== board.postId && nextSnap) {
    await broadcastUpdate(nextPostId, {
      type: 'snapshot',
      turn: nextTurn,
      versionHash: nextSnap.versionHash,
      snapshot: nextSnap,
    });
  }

  return {
    resolved: true,
    gameOver: false,
    flippedTileId,
    flippedRole,
    nextTurn,
    nextFaction,
    reason,
  };
}

/** Lazy evaluation guard. Resolve inline when the clock expired. */
export async function ensureTurnFresh(opts: {
  season: string;
  turn: number;
  config: SubConfig;
  spawnNextPost?: SpawnNextPost;
}): Promise<number> {
  const { season, turn, config, spawnNextPost } = opts;
  const board = await getPublicBoard(season, turn);
  if (!board) return turn;

  if (board.status === 'ACTIVE' && Date.now() > board.turnEndTime) {
    const result = await resolveAndAdvance({ season, turn, config, spawnNextPost });
    if (result && !result.gameOver) return result.nextTurn;
  }
  return turn;
}

/** Record a discarded clue as a veto strike; auto-flip a neutral on 2nd strike. */
export async function registerVetoStrike(opts: {
  season: string;
  turn: number;
  config: SubConfig;
  spawnNextPost?: SpawnNextPost;
}): Promise<{ penalized: boolean; result?: ResolveResult | null }> {
  const { season, turn, config, spawnNextPost } = opts;
  const board = await getPublicBoard(season, turn);
  if (!board || board.status !== 'ACTIVE') return { penalized: false };

  board.vetoStrikes += 1;
  await writePublicBoard(board);

  if (board.vetoStrikes >= STRIKE_LIMIT) {
    const result = await resolveAndAdvance({
      season,
      turn,
      config,
      forceReason: 'strike_penalty',
      spawnNextPost,
    });
    return { penalized: true, result };
  }
  return { penalized: false };
}
