/**
 * Snapshot compiler (cache-stampede mitigation).
 *
 * Write actions touch raw primitives (votes ZSET, clue). Client reads are
 * restricted to a pre-compiled flat `board:snapshot:{turn}` JSON regenerated on
 * a debounce. This converts expensive per-request sorts into an O(1) read.
 */

import { redis } from '@devvit/web/server';
import { SCHEMA_VERSION, type BoardSnapshot, type EndgameStats, type PublicTile, type VisualFaction } from '../shared/types';
import { countTerritory, factionEfficiencyPct, factionTilesCaptured } from '../shared/endgameLogic';
import { defaultTheme, factionLabel, factionTag } from '../shared/theme';
import { getPublicBoard, getPrivateBoard } from './boardService';
import { getLivePostId } from './livePostService';
import { EPHEMERAL_TTL_SECONDS, keys, turnRef } from './keys';
import { getActiveClue } from './voteService';
import { enrichSnapshotForClient } from './livePostService';

/** Read the aggregated vote weight for every tile in a turn. */
async function readVoteMap(season: string, turn: number): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const entries = await redis.zRange(keys.votes(season, turn), 0, -1, { by: 'rank' });
    for (const { member, score } of entries) {
      map.set(member, score);
    }
  } catch {
    // Empty ZSET / missing key -> no votes yet.
  }
  return map;
}

/** Tiny FNV-1a hash over the meaningful snapshot fields. */
function computeVersionHash(tiles: PublicTile[], extra: string): string {
  let h = 0x811c9dc5;
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
  };
  for (const t of tiles) {
    feed(`${t.id}:${t.voteCount}:${t.isFlipped ? 1 : 0}:${t.revealedRole ?? ''}`);
  }
  feed(extra);
  return (h >>> 0).toString(16);
}

function buildTicker(board: {
  status: string;
  currentFaction: VisualFaction;
  scores: { red: number; blue: number };
  seasonEnded?: boolean;
  winner?: VisualFaction;
  endReason?: string;
}): string {
  const theme = defaultTheme();
  if (board.seasonEnded && board.winner) {
    const name = factionLabel(theme, board.winner).toUpperCase();
    if (board.endReason === 'assassin') {
      return 'TERMINAL GLITCH // VIRUS DETECTED';
    }
    if (board.endReason === 'majority') {
      return `${name} // BOARD MAJORITY SECURED`;
    }
    return `${name} // SUPREMACY ACHIEVED`;
  }
  if (board.seasonEnded && board.endReason === 'stalemate') {
    return 'SYSTEM STALEMATE // REBOOT REQUIRED';
  }
  if (board.status === 'RESOLVED') {
    return 'This turn has concluded. Tap to jump to the live war room.';
  }
  const mover = factionTag(theme, board.currentFaction).toUpperCase();
  const pink = factionTag(theme, 'red').toUpperCase();
  const green = factionTag(theme, 'blue').toUpperCase();
  return `${mover} to move | ${pink} ${board.scores.red} vs ${green} ${board.scores.blue} tiles left`;
}

function buildEndgameStats(
  tiles: PublicTile[],
  winner: VisualFaction | undefined,
  endReason: string | undefined,
  seasonStartedAt: number | undefined,
  compiledAt: number,
): EndgameStats {
  const territory = countTerritory(tiles);
  const statsFaction = winner ?? 'red';
  const elapsed = seasonStartedAt ? compiledAt - seasonStartedAt : 0;

  return {
    tilesCaptured: factionTilesCaptured(territory, statsFaction),
    totalTiles: territory.totalTiles,
    timeElapsedMs: elapsed,
    factionEfficiencyPct: factionEfficiencyPct(territory, statsFaction),
    virusTriggered: endReason === 'assassin',
  };
}

/** Compile and persist the snapshot for `{season, turn}`. */
export async function compileSnapshot(opts: {
  season: string;
  turn: number;
}): Promise<BoardSnapshot | null> {
  const { season, turn } = opts;
  const board = await getPublicBoard(season, turn);
  if (!board) return null;

  const privateBoard = await getPrivateBoard(season);
  const seasonStartedAt = privateBoard?.seasonStartedAt;
  const compiledAt = Date.now();

  const [voteMap, clue] = await Promise.all([
    readVoteMap(season, turn),
    getActiveClue(season, turn),
  ]);

  const tiles: PublicTile[] = board.tiles.map((t) => ({
    id: t.id,
    word: t.word,
    isFlipped: t.isFlipped,
    revealedRole: t.revealedRole,
    voteCount: Math.round(voteMap.get(t.id) ?? 0),
  }));

  const clueSig = clue ? `${clue.word}:${clue.count}:${clue.faction}` : '';
  const versionHash = computeVersionHash(
    tiles,
    `${board.status}:${board.currentFaction}:${board.turnEndTime}:${board.scores.red}:${board.scores.blue}:${clueSig}`,
  );

  const livePostId =
    board.status === 'RESOLVED' ? await getLivePostId(season) : undefined;

  const endgameStats = board.seasonEnded
    ? buildEndgameStats(
        tiles,
        board.winner,
        board.endReason,
        seasonStartedAt,
        compiledAt,
      )
    : undefined;

  const snapshot: BoardSnapshot = {
    schema_version: SCHEMA_VERSION,
    season,
    turn,
    postId: board.postId,
    status: board.status,
    currentFaction: board.currentFaction,
    turnEndTime: board.turnEndTime,
    tiles,
    scores: board.scores,
    nextPostId: board.nextPostId,
    livePostId: livePostId && livePostId !== board.postId ? livePostId : undefined,
    ticker: buildTicker(board),
    activeClue: clue ?? undefined,
    versionHash,
    compiledAt,
    seasonEnded: board.seasonEnded,
    winner: board.winner,
    endReason: board.endReason,
    seasonStartedAt,
    endgameStats,
  };

  await redis.set(keys.boardSnapshot(turnRef(season, turn)), JSON.stringify(snapshot));
  await redis.expire(keys.boardSnapshot(turnRef(season, turn)), EPHEMERAL_TTL_SECONDS);

  return snapshot;
}

/** Client read path: fetch the pre-compiled snapshot, recompiling when stale. */
export async function readSnapshot(opts: {
  season: string;
  turn: number;
  maxAgeMs?: number;
}): Promise<BoardSnapshot | null> {
  const { season, turn, maxAgeMs = 15_000 } = opts;
  const raw = await redis.get(keys.boardSnapshot(turnRef(season, turn)));
  if (raw) {
    const snap = JSON.parse(raw) as BoardSnapshot;
    if (Date.now() - snap.compiledAt <= maxAgeMs) {
      return enrichSnapshotForClient(snap);
    }
  }
  const compiled = await compileSnapshot({ season, turn });
  return compiled ? enrichSnapshotForClient(compiled) : null;
}
