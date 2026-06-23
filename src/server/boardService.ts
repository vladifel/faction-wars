/**
 * Board assembly engine.
 *
 * Blends a 70% auto-generated global pool with 30% subreddit "lore" words,
 * shuffles with Fisher-Yates, and assigns Codenames-style hidden roles. Produces a
 * client-safe `PublicBoard` and a strictly server-side `PrivateBoard` solution.
 */

import { redis } from '@devvit/web/server';
import {
  BOARD_TILE_COUNT,
  SCHEMA_VERSION,
  type FactionScores,
  type PrivateBoard,
  type PublicBoard,
  type PublicTile,
  type SolutionTile,
  type SubConfig,
  type TileRole,
  type VisualFaction,
} from '../shared/types';
import { EPHEMERAL_TTL_SECONDS, keys, turnRef } from './keys';
import {
  getRecentBoardFingerprints,
  isRecentFingerprint,
  MAX_ASSEMBLE_ATTEMPTS,
  rememberBoardWords,
} from './boardHistoryService';
import { getGlobalWordPool } from './wordPoolService';
import { pickOne, sample, shuffle } from './random';
import {
  boardFingerprint,
  sanitizeLoreWords,
  validateBoardWord,
} from '../shared/validators';

const LORE_TARGET = 7;
const GLOBAL_TARGET = BOARD_TILE_COUNT - LORE_TARGET; // 18

const STARTING_FACTION_TILES = 9;
const SECOND_FACTION_TILES = 8;
const NEUTRAL_TILES = 7;
const ASSASSIN_TILES = 1;

/** Validated, deduped word pool from raw strings. */
function validatedPool(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const v = validateBoardWord(w);
    if (!v.valid || !v.value || seen.has(v.value)) continue;
    seen.add(v.value);
    out.push(v.value);
  }
  return out;
}

/** Assemble 25 unique words, weighted 70/30 global/lore with backfill. */
async function assembleWordsOnce(config: SubConfig): Promise<string[]> {
  const lorePool = validatedPool(sanitizeLoreWords(config.words.lore).words);
  const globalPool = validatedPool(await getGlobalWordPool());

  const lore = sample(lorePool, LORE_TARGET);

  const globalNeeded = BOARD_TILE_COUNT - lore.length;
  const usableGlobal = globalPool.filter((w) => !lore.includes(w));
  const global = sample(usableGlobal, Math.max(GLOBAL_TARGET, globalNeeded));

  const combined = [...lore, ...global].slice(0, BOARD_TILE_COUNT);
  return shuffle(combined);
}

/** Assemble words; reroll if fingerprint matches a recent board for this sub. */
export async function assembleWordsForSubreddit(config: SubConfig): Promise<string[]> {
  const recent = await getRecentBoardFingerprints(config.subredditId);
  for (let attempt = 0; attempt < MAX_ASSEMBLE_ATTEMPTS; attempt++) {
    const words = await assembleWordsOnce(config);
    if (words.length < BOARD_TILE_COUNT) continue;
    const fp = boardFingerprint(words);
    if (!isRecentFingerprint(fp, recent)) return words;
  }
  return await assembleWordsOnce(config);
}

/** Build the role distribution and shuffle it across tile slots. */
function assignRoles(startingFaction: VisualFaction): TileRole[] {
  const second: VisualFaction = startingFaction === 'red' ? 'blue' : 'red';
  const roles: TileRole[] = [
    ...Array<TileRole>(STARTING_FACTION_TILES).fill(startingFaction),
    ...Array<TileRole>(SECOND_FACTION_TILES).fill(second),
    ...Array<TileRole>(NEUTRAL_TILES).fill('neutral'),
    ...Array<TileRole>(ASSASSIN_TILES).fill('assassin'),
  ];
  return shuffle(roles);
}

function initialScores(solution: SolutionTile[]): FactionScores {
  return {
    red: solution.filter((s) => s.role === 'red').length,
    blue: solution.filter((s) => s.role === 'blue').length,
  };
}

/**
 * Remaining (unrevealed) tiles per faction. Used when a board is carried into
 * the next turn so the running score persists instead of resetting to 9/8.
 */
function remainingScores(tiles: PublicTile[], solution: SolutionTile[]): FactionScores {
  const flipped = new Set(tiles.filter((t) => t.isFlipped).map((t) => t.id));
  let red = 0;
  let blue = 0;
  for (const s of solution) {
    if (flipped.has(s.id)) continue;
    if (s.role === 'red') red++;
    else if (s.role === 'blue') blue++;
  }
  return { red, blue };
}

export interface CreateBoardInput {
  season: string;
  turn: number;
  postId: string;
  config: SubConfig;
  /** When advancing turns we may carry the prior board's words/solution. */
  carryOver?: {
    tiles: PublicTile[];
    solution: SolutionTile[];
    startingFaction: VisualFaction;
  };
}

export interface CreatedBoard {
  publicBoard: PublicBoard;
  privateBoard: PrivateBoard;
}

/** Create and persist a fresh board frame for `{season, turn}`. */
export async function createAndPersistBoard(input: CreateBoardInput): Promise<CreatedBoard> {
  const { season, turn, postId, config, carryOver } = input;

  const startingFaction: VisualFaction =
    carryOver?.startingFaction ?? (Math.random() < 0.5 ? 'red' : 'blue');

  let tiles: PublicTile[];
  let solution: SolutionTile[];

  if (carryOver) {
    tiles = carryOver.tiles.map((t) => ({ ...t, voteCount: 0 }));
    solution = carryOver.solution;
  } else {
    const words = await assembleWordsForSubreddit(config);
    const roles = assignRoles(startingFaction);
    tiles = words.map((word, i) => ({
      id: `t${i}`,
      word,
      voteCount: 0,
      isFlipped: false,
    }));
    solution = words.map((_, i) => ({ id: `t${i}`, role: roles[i]! }));
  }

  const turnEndTime = Date.now() + config.pacing.turnDurationSeconds * 1000;
  const existingPrivate = carryOver ? await getPrivateBoard(season) : null;
  const seasonStartedAt = existingPrivate?.seasonStartedAt ?? Date.now();

  const publicBoard: PublicBoard = {
    schema_version: SCHEMA_VERSION,
    season,
    turn,
    postId,
    status: 'ACTIVE',
    currentFaction: startingFaction,
    turnEndTime,
    tiles,
    scores: carryOver ? remainingScores(tiles, solution) : initialScores(solution),
    vetoStrikes: 0,
  };

  const privateBoard: PrivateBoard = {
    schema_version: SCHEMA_VERSION,
    season,
    turn,
    solution,
    startingFaction,
    seasonStartedAt,
  };

  const ref = turnRef(season, turn);
  await Promise.all([
    redis.set(keys.boardPublic(ref), JSON.stringify(publicBoard)),
    redis.set(keys.boardPrivate(season), JSON.stringify(privateBoard)),
    redis.set(keys.currentTurn(season), String(turn)),
    redis.set(keys.postContext(postId), JSON.stringify({ season, turn })),
  ]);
  await redis.expire(keys.boardPublic(ref), EPHEMERAL_TTL_SECONDS);

  if (!carryOver) {
    await rememberBoardWords(config.subredditId, publicBoard.tiles.map((t) => t.word));
  }

  return { publicBoard, privateBoard };
}

/** Read the public board for a turn (or null). */
export async function getPublicBoard(
  season: string,
  turn: number,
): Promise<PublicBoard | null> {
  const raw = await redis.get(keys.boardPublic(turnRef(season, turn)));
  return raw ? (JSON.parse(raw) as PublicBoard) : null;
}

/** Read the private solution for a season (or null). Server-only. */
export async function getPrivateBoard(season: string): Promise<PrivateBoard | null> {
  const raw = await redis.get(keys.boardPrivate(season));
  return raw ? (JSON.parse(raw) as PrivateBoard) : null;
}

/** Persist an updated public board. */
export async function writePublicBoard(board: PublicBoard): Promise<void> {
  await redis.set(keys.boardPublic(turnRef(board.season, board.turn)), JSON.stringify(board));
}

/** Pick a random still-unflipped neutral tile id (used by the penalty strike). */
export function randomUnflippedNeutral(
  board: PublicBoard,
  solution: SolutionTile[],
): string | undefined {
  const neutralIds = new Set(solution.filter((s) => s.role === 'neutral').map((s) => s.id));
  const candidates = board.tiles.filter((t) => !t.isFlipped && neutralIds.has(t.id));
  return pickOne(candidates)?.id;
}
