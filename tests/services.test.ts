import { describe, it, expect, beforeEach } from 'vitest';
import { __test, context, redis } from './mocks/devvitServer';
import { defaultSubConfig } from '../src/server/migrations';
import {
  createAndPersistBoard,
  getPublicBoard,
  getPrivateBoard,
  randomUnflippedNeutral,
  writePublicBoard,
} from '../src/server/boardService';
import {
  assignFaction,
  getAssignedFaction,
  getFactionCounts,
  visualFactionFor,
} from '../src/server/factionService';
import { castVote, dispatchClue, getActiveClue, vetoClue } from '../src/server/voteService';
import { compileSnapshot } from '../src/server/snapshotService';
import { resolveAndAdvance, registerVetoStrike } from '../src/server/turnService';
import { claimCommander, getCommander } from '../src/server/sessionService';
import { keys } from '../src/server/keys';
import type { GlobalStats, SolutionTile, SubConfig, TileRole, VisualFaction } from '../src/shared/types';

const SUB = 't5_sub';
const SEASON = 's1';
const POST = 't3_post0';

function cfg(): SubConfig {
  return defaultSubConfig(SUB);
}

function tilesOfRole(solution: SolutionTile[], role: TileRole): string[] {
  return solution.filter((s) => s.role === role).map((s) => s.id);
}

async function readGlobalStats(userId: string): Promise<GlobalStats> {
  const raw = await redis.get(keys.globalStats(userId));
  return JSON.parse(raw!) as GlobalStats;
}

beforeEach(() => {
  __test.reset();
});

describe('boardService', () => {
  it('creates a 25-tile board with 9/8 split, 7 neutral, 1 assassin', async () => {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
    const pub = (await getPublicBoard(SEASON, 1))!;
    const priv = (await getPrivateBoard(SEASON))!;

    expect(pub.tiles).toHaveLength(25);
    expect(new Set(pub.tiles.map((t) => t.word)).size).toBe(25); // unique words
    expect(priv.solution).toHaveLength(25);

    const counts = { red: 0, blue: 0, neutral: 0, assassin: 0 };
    for (const s of priv.solution) counts[s.role]++;
    expect(counts.neutral).toBe(7);
    expect(counts.assassin).toBe(1);
    expect(counts.red + counts.blue).toBe(17);
    expect(Math.abs(counts.red - counts.blue)).toBe(1); // 9/8 split

    // The starting faction holds the extra tile and moves first.
    expect(pub.scores[pub.currentFaction]).toBe(9);
    expect(pub.status).toBe('ACTIVE');
  });

  it('randomUnflippedNeutral only returns unflipped neutral tiles', async () => {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
    const pub = (await getPublicBoard(SEASON, 1))!;
    const priv = (await getPrivateBoard(SEASON))!;
    const neutralIds = new Set(tilesOfRole(priv.solution, 'neutral'));
    const picked = randomUnflippedNeutral(pub, priv.solution)!;
    expect(neutralIds.has(picked)).toBe(true);
  });
});

describe('factionService', () => {
  it('assigns and balances trusted accounts across teams', async () => {
    for (let i = 0; i < 10; i++) {
      await assignFaction({ season: SEASON, subredditId: SUB, userId: `t2_u${i}`, trust: cfg().trust });
    }
    const counts = await getFactionCounts();
    expect(counts.red + counts.blue).toBe(10);
    expect(Math.abs(counts.red - counts.blue)).toBeLessThanOrEqual(1);
  });

  it('is idempotent: repeat calls keep the same faction', async () => {
    const a = await assignFaction({ season: SEASON, subredditId: SUB, userId: 't2_x', trust: cfg().trust });
    const b = await assignFaction({ season: SEASON, subredditId: SUB, userId: 't2_x', trust: cfg().trust });
    expect(a.visualFaction).toBe(b.visualFaction);
    expect(await getAssignedFaction(SEASON, 't2_x')).toBe(a.visualFaction);
  });

  it('shadowbans untrusted accounts but shows a believable team', async () => {
    __test.setUntrusted('t2_bot');
    const res = await assignFaction({ season: SEASON, subredditId: SUB, userId: 't2_bot', trust: cfg().trust });
    expect(res.trusted).toBe(false);
    expect(['red', 'blue']).toContain(res.visualFaction);
    expect(await getAssignedFaction(SEASON, 't2_bot')).toBe('shadowbanned');
    // Counters are NOT bumped for suppressed accounts.
    expect((await getFactionCounts()).red + (await getFactionCounts()).blue).toBe(0);
  });

  it('visualFactionFor is stable for shadowbanned ids', () => {
    expect(visualFactionFor('shadowbanned', 't2_abc')).toBe(visualFactionFor('shadowbanned', 't2_abc'));
    expect(visualFactionFor('red', 't2_abc')).toBe('red');
  });
});

describe('voteService', () => {
  beforeEach(async () => {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
  });

  it('enforces one vote per user per turn', async () => {
    const first = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't0', userId: 't2_a' });
    expect(first).toMatchObject({ success: true, voteCount: 1 });
    const second = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't1', userId: 't2_a' });
    expect(second.success).toBe(false);
  });

  it('weight 0 (shadowbanned) is silently dropped but looks accepted', async () => {
    const res = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't0', userId: 't2_b', weight: 0 });
    expect(res.success).toBe(true);
    expect(res.voteCount).toBe(0); // no weight added to the ZSET
  });

  it('aggregates weighted votes from distinct users', async () => {
    await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't5', userId: 't2_a' });
    const r = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't5', userId: 't2_c' });
    expect(r.voteCount).toBe(2);
  });

  it('rejects unknown tile ids without consuming the vote slot', async () => {
    const bad = await castVote({
      season: SEASON,
      turn: 1,
      subredditId: SUB,
      tileId: 'not-a-real-tile',
      userId: 't2_a',
    });
    expect(bad).toMatchObject({ success: false, error: 'Invalid tile.' });
    const ok = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't0', userId: 't2_a' });
    expect(ok.success).toBe(true);
  });

  it('rejects votes on flipped tiles', async () => {
    const pub = (await getPublicBoard(SEASON, 1))!;
    pub.tiles[0]!.isFlipped = true;
    await writePublicBoard(pub);
    const res = await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't0', userId: 't2_a' });
    expect(res).toMatchObject({ success: false, error: 'Tile already flipped.' });
  });

  it('dispatches and reads back an uppercased clue', async () => {
    await dispatchClue({ season: SEASON, turn: 1, subredditId: SUB, faction: 'red', userId: 't2_a', word: 'ocean', count: 3 });
    const clue = (await getActiveClue(SEASON, 1))!;
    expect(clue).toMatchObject({ word: 'OCEAN', count: 3, faction: 'red' });
  });

  it('veto past threshold discards the clue', async () => {
    await dispatchClue({ season: SEASON, turn: 1, subredditId: SUB, faction: 'red', userId: 't2_a', word: 'ocean', count: 3 });
    const out = await vetoClue({ season: SEASON, turn: 1, userId: 't2_v', activePlayers: 1, vetoThreshold: 0.2 });
    expect(out).toMatchObject({ accepted: true, clueDiscarded: true });
    expect(await getActiveClue(SEASON, 1)).toBeNull();
  });

  it('veto below threshold keeps the clue; double-veto rejected', async () => {
    await dispatchClue({ season: SEASON, turn: 1, subredditId: SUB, faction: 'red', userId: 't2_a', word: 'ocean', count: 3 });
    const out = await vetoClue({ season: SEASON, turn: 1, userId: 't2_v', activePlayers: 100, vetoThreshold: 0.2 });
    expect(out.clueDiscarded).toBe(false);
    const dup = await vetoClue({ season: SEASON, turn: 1, userId: 't2_v', activePlayers: 100, vetoThreshold: 0.2 });
    expect(dup.accepted).toBe(false);
    expect(await getActiveClue(SEASON, 1)).not.toBeNull();
  });
});

describe('snapshotService', () => {
  beforeEach(async () => {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
  });

  it('reflects vote counts and changes its version hash when state changes', async () => {
    const base = (await compileSnapshot({ season: SEASON, turn: 1 }))!;
    await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: 't0', userId: 't2_a' });
    const after = (await compileSnapshot({ season: SEASON, turn: 1 }))!;
    expect(after.tiles.find((t) => t.id === 't0')!.voteCount).toBe(1);
    expect(after.versionHash).not.toBe(base.versionHash);
    expect(after.tiles).toHaveLength(25);
  });
});

describe('turnService.resolveAndAdvance', () => {
  async function setup() {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
    const pub = (await getPublicBoard(SEASON, 1))!;
    const priv = (await getPrivateBoard(SEASON))!;
    return { pub, priv, current: pub.currentFaction as VisualFaction };
  }

  it('flipping the assassin ends the game for the other faction', async () => {
    const { priv, current } = await setup();
    await redis.hSet(keys.factions(SEASON), {
      t2_red: 'red',
      t2_blue: 'blue',
      t2_bot: 'shadowbanned',
    });
    const assassinId = tilesOfRole(priv.solution, 'assassin')[0]!;
    await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: assassinId, userId: 't2_a' });
    const res = (await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg() }))!;
    expect(res.gameOver).toBe(true);
    expect(res.reason).toBe('assassin');
    expect(res.winner).toBe(current === 'red' ? 'blue' : 'red');
    const resolved = (await getPublicBoard(SEASON, 1))!;
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.seasonEnded).toBe(true);
    expect(resolved.winner).toBe(res.winner);
    expect(resolved.endReason).toBe('assassin');

    const winnerId = res.winner === 'red' ? 't2_red' : 't2_blue';
    const loserId = res.winner === 'red' ? 't2_blue' : 't2_red';
    expect((await readGlobalStats(winnerId)).wins).toBe(1);
    expect((await readGlobalStats(loserId)).losses).toBe(1);
    expect(await redis.get(keys.globalStats('t2_bot'))).toBeUndefined();
    expect(await redis.get(keys.seasonResultsRecorded(SEASON))).toBe('1');
  });

  it('flipping own tile lowers own remaining score and advances the turn', async () => {
    const { priv, current } = await setup();
    const ownId = tilesOfRole(priv.solution, current)[0]!;
    await castVote({ season: SEASON, turn: 1, subredditId: SUB, tileId: ownId, userId: 't2_a' });
    const res = (await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg() }))!;
    expect(res.gameOver).toBe(false);
    expect(res.flippedRole).toBe(current);
    expect(res.nextTurn).toBe(2);
    expect(res.nextFaction).toBe(current === 'red' ? 'blue' : 'red');

    const next = (await getPublicBoard(SEASON, 2))!;
    expect(next.status).toBe('ACTIVE');
    expect(next.currentFaction).toBe(res.nextFaction);
    expect(next.scores[current]).toBe(8); // started at 9, one revealed
  });

  it('no votes resolves with reason no_votes and still advances', async () => {
    await setup();
    const res = (await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg() }))!;
    expect(res.reason).toBe('no_votes');
    expect(res.flippedTileId).toBeUndefined();
    expect(res.nextTurn).toBe(2);
  });

  it('is idempotent: resolving a RESOLVED board returns null', async () => {
    await setup();
    await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg() });
    const again = await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg() });
    expect(again).toBeNull();
  });

  it('two veto strikes auto-flip a neutral as a penalty', async () => {
    await setup();
    const first = await registerVetoStrike({ season: SEASON, turn: 1, config: cfg() });
    expect(first.penalized).toBe(false);
    const second = await registerVetoStrike({ season: SEASON, turn: 1, config: cfg() });
    expect(second.penalized).toBe(true);
    expect(second.result?.reason).toBe('strike_penalty');
    expect(second.result?.flippedRole).toBe('neutral');
  });
});

describe('sessionService.claimCommander', () => {
  beforeEach(async () => {
    await createAndPersistBoard({ season: SEASON, turn: 1, postId: POST, config: cfg() });
  });

  it('first claimer wins, later claimer for same faction loses', async () => {
    const a = await claimCommander({ season: SEASON, turn: 1, faction: 'red', userId: 't2_a' });
    const b = await claimCommander({ season: SEASON, turn: 1, faction: 'red', userId: 't2_b' });
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect(await getCommander(SEASON, 1, 'red')).toBe('t2_a');
  });

  it('each faction has its own commander slot', async () => {
    await claimCommander({ season: SEASON, turn: 1, faction: 'red', userId: 't2_a' });
    const blue = await claimCommander({ season: SEASON, turn: 1, faction: 'blue', userId: 't2_b' });
    expect(blue).toBe(true);
  });
});

describe('livePostService', () => {
  it('livePostId skips ahead when several turns have resolved', async () => {
    let n = 0;
    const spawnNextPost = async () => `post-${++n}`;

    await createAndPersistBoard({ season: SEASON, turn: 1, postId: 'post-0', config: cfg() });
    await resolveAndAdvance({ season: SEASON, turn: 1, config: cfg(), spawnNextPost });
    await resolveAndAdvance({ season: SEASON, turn: 2, config: cfg(), spawnNextPost });
    const turn3Board = (await getPublicBoard(SEASON, 3))!;

    const { readSnapshot } = await import('../src/server/snapshotService');
    const oldSnap = (await readSnapshot({ season: SEASON, turn: 1, maxAgeMs: 0 }))!;

    expect(oldSnap.nextPostId).toBe('post-1');
    expect(oldSnap.nextPostId).not.toBe(turn3Board.postId);
    expect(oldSnap.livePostId).toBe(turn3Board.postId);
    expect(oldSnap.ticker).toContain('Turn 3 is live');
  });
});

// Touch context wiring
describe('context wiring', () => {
  it('mock context is mutable', () => {
    context.userId = 't2_z';
    expect(context.userId).toBe('t2_z');
  });
});
