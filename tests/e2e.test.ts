import { describe, it, expect, beforeEach } from 'vitest';
import { __test, context } from './mocks/devvitServer';
import { api } from '../src/server/routes/api';
import { getPrivateBoard } from '../src/server/boardService';
import type { ClientSession, VoteResponse, ClueResponse, ClaimCommanderResponse, StateResponse, VetoResponse, CommanderXrayResponse, NewGameResponse } from '../src/shared/api';
import type { SolutionTile, VisualFaction } from '../src/shared/types';
import { clueConflictsWithBoard } from '../src/shared/validators';

const SEASON = 's_t3_post0';

function asUser(userId: string | undefined): void {
  context.userId = userId;
}

async function get<T>(path: string): Promise<T> {
  const res = await api.request(path, { method: 'GET' });
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await api.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as T };
}

function pickSafeClue(boardWords: string[]): string {
  for (const candidate of ['QUIZ', 'FABLE', 'JARGON', 'VIVID', 'NINJA', 'PIXEL']) {
    if (!clueConflictsWithBoard(candidate, boardWords)) return candidate;
  }
  return 'QUIZ';
}

function neutralTile(solution: SolutionTile[]): string {
  return solution.find((s) => s.role === 'neutral')!.id;
}

/** Join until we find a logged-in user on the moving faction this turn. */
async function findActiveUser(current: VisualFaction, prefix = 't2_u'): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const uid = `${prefix}${i}`;
    asUser(uid);
    const s = await get<ClientSession>('/init');
    if (s.visualFaction === current) return uid;
  }
  throw new Error('No active-faction user found');
}

beforeEach(() => {
  __test.reset();
  context.subredditId = 't5_sub';
  context.postId = 't3_post0';
  context.userId = undefined;
});

describe('full game flow over /api', () => {
  it('bootstraps a board on first /init', async () => {
    const session = await get<ClientSession>('/init');
    expect(session.ok).toBe(true);
    expect(session.snapshot?.tiles).toHaveLength(25);
    expect(session.turn).toBe(1);
    expect(session.loggedIn).toBe(false);
  });

  it('runs a turn: claim -> clue -> vote -> resolve -> advance', async () => {
    // Bootstrap as anon to create the board.
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;

    // Recruit users and discover one on each side.
    const factionOf = new Map<string, VisualFaction>();
    for (let i = 0; i < 12; i++) {
      const uid = `t2_u${i}`;
      asUser(uid);
      const s = await get<ClientSession>('/init');
      factionOf.set(uid, s.visualFaction);
    }
    const activeUser = [...factionOf].find(([, f]) => f === current)![0];
    const enemyUser = [...factionOf].find(([, f]) => f !== current)![0];

    // Enemy cannot vote while it is not their move.
    asUser(enemyUser);
    const enemyVote = await post<VoteResponse>('/vote', { tileId: 't0' });
    expect(enemyVote.status).toBe(403);

    // Anonymous cannot vote.
    asUser(undefined);
    const anonVote = await post<VoteResponse>('/vote', { tileId: 't0' });
    expect(anonVote.status).toBe(401);

    // Active user claims command and dispatches a clue.
    asUser(activeUser);
    const claim = await post<ClaimCommanderResponse>('/claim-commander');
    expect(claim.body.isCommander).toBe(true);

    const clueWord = pickSafeClue(boot.snapshot!.tiles.map((t) => t.word));
    const clue = await post<ClueResponse>('/clue', { word: clueWord, count: 2 });
    expect(clue.body.success).toBe(true);
    expect(clue.body.snapshot?.activeClue?.word).toBe(clueWord.toUpperCase());

    // Vote a known-neutral tile so the turn advances deterministically
    // (no assassin game-over, no score reaching zero).
    const priv = (await getPrivateBoard(SEASON))!;
    const target = neutralTile(priv.solution);
    const vote = await post<VoteResponse>('/vote', { tileId: target });
    expect(vote.body.success).toBe(true);
    expect(vote.body.snapshot?.tiles.find((t) => t.id === target)?.voteCount).toBe(1);

    // Force the turn to resolve (moderator-only in production builds).
    asUser('t2_mod_resolve');
    const resolve = await post<{ ok: boolean }>('/force-resolve');
    expect(resolve.body.ok).toBe(true);

    // The original post is now a RESOLVED tombstone pointing forward.
    const oldState = await get<StateResponse>('/state');
    expect(oldState.status).toBe('RESOLVED');
    expect(oldState.snapshot?.turn).toBe(1);
    expect(oldState.snapshot?.status).toBe('RESOLVED');
    expect(oldState.nextPostId).toBeTruthy();

    // Writes on the tombstone post must stay closed (no bleed to the live turn).
    asUser(activeUser);
    const tombstoneVote = await post<VoteResponse>('/vote', { tileId: target });
    expect(tombstoneVote.status).toBe(409);

    // Follow the redirect: the next post hosts an ACTIVE turn 2 for the other faction.
    context.postId = oldState.nextPostId!;
    const next = await get<StateResponse>('/state');
    expect(next.status).toBe('ACTIVE');
    expect(next.snapshot!.turn).toBe(2);
    expect(next.snapshot!.currentFaction).toBe(current === 'red' ? 'blue' : 'red');
    // Fresh turn => the prior clue is gone.
    expect(next.snapshot!.activeClue).toBeUndefined();
  });

  it('dev playtest override lets a solo user vote regardless of faction', async () => {
    context.appVersion = '0.0.1.8'; // 4-seg => playtest
    await get<ClientSession>('/init'); // bootstrap board
    asUser('t2_solo');
    const s = await get<ClientSession>('/init');
    expect(s.isActiveFaction).toBe(true);
    expect(s.trusted).toBe(true);
    expect(s.devPlaytest).toBe(true);

    const priv = (await getPrivateBoard(SEASON))!;
    const vote = await post<VoteResponse>('/vote', { tileId: neutralTile(priv.solution) });
    expect(vote.body.success).toBe(true);
  });

  it('playtest new-game spawns a fresh war room post', async () => {
    context.appVersion = '0.0.1.8';
    asUser('t2_solo');
    const res = await post<NewGameResponse>('/new-game');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.postId).toBeTruthy();
    expect(res.body.navigateTo).toContain('playtest=faction-warfare');
  });

  it('rejects invalid clues with 400', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;
    asUser(await findActiveUser(current, 't2_c'));
    const bad = await post<ClueResponse>('/clue', { word: 'two words', count: 2 });
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  it('veto discards an active clue for the moving faction', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;
    const commander = await findActiveUser(current, 't2_v');
    const voter = await findActiveUser(current, 't2_w');

    asUser(commander);
    await post<ClaimCommanderResponse>('/claim-commander');
    const words = boot.snapshot!.tiles.map((t) => t.word);
    await post<ClueResponse>('/clue', { word: pickSafeClue(words), count: 2 });

    asUser(voter);
    const veto = await post<VetoResponse>('/veto');
    expect(veto.body.success).toBe(true);
    expect(veto.body.clueDiscarded).toBe(true);
    expect(veto.body.snapshot?.activeClue).toBeUndefined();
  });

  it('commander-xray is commander-only and returns all 25 roles', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;
    const commander = await findActiveUser(current, 't2_x');
    const other = await findActiveUser(current, 't2_y');

    asUser(other);
    const denied = await get<CommanderXrayResponse>('/commander-xray');
    expect(denied.ok).toBe(false);

    asUser(commander);
    await post<ClaimCommanderResponse>('/claim-commander');
    const xray = await get<CommanderXrayResponse>('/commander-xray');
    expect(xray.ok).toBe(true);
    expect(xray.tiles).toHaveLength(25);
    expect(new Set(xray.tiles!.map((t) => t.role)).size).toBeGreaterThan(1);
  });

  it('rejects invalid tile ids with 400', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;
    asUser(await findActiveUser(current, 't2_badtile'));
    const bad = await post<VoteResponse>('/vote', { tileId: 'not-a-real-tile' });
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  it('rejects a second vote from the same user in one turn', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const current = boot.snapshot!.currentFaction as VisualFaction;
    asUser(await findActiveUser(current, 't2_d'));
    const priv = (await getPrivateBoard(SEASON))!;
    const target = neutralTile(priv.solution);
    const first = await post<VoteResponse>('/vote', { tileId: target });
    expect(first.body.success).toBe(true);
    const second = await post<VoteResponse>('/vote', { tileId: 't0' });
    expect(second.body.success).toBe(false);
  });

  it('rejects clues that match or overlap a board word', async () => {
    await get<ClientSession>('/init');
    const boot = await get<ClientSession>('/init');
    const boardWord = boot.snapshot!.tiles[0]!.word;
    asUser(await findActiveUser(boot.snapshot!.currentFaction as VisualFaction, 't2_cl'));
    await post<ClaimCommanderResponse>('/claim-commander');
    const bad = await post<ClueResponse>('/clue', { word: boardWord, count: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.success).toBe(false);
  });

  it('mod lore API add/list/remove/sanitize', async () => {
    context.userId = 't2_mod1';
    await get<ClientSession>('/init');
    const add = await post<{ ok: boolean; lore?: string[] }>('/mod/lore', {
      action: 'add',
      word: 'MEME',
    });
    expect(add.body.ok).toBe(true);
    expect(add.body.lore).toContain('MEME');

    const list = await post<{ ok: boolean; lore?: string[] }>('/mod/lore', { action: 'list' });
    expect(list.body.lore).toContain('MEME');

    const bad = await post<{ ok: boolean }>('/mod/lore', { action: 'add', word: 'SHIT' });
    expect(bad.body.ok).toBe(false);

    const remove = await post<{ ok: boolean; lore?: string[] }>('/mod/lore', {
      action: 'remove',
      word: 'MEME',
    });
    expect(remove.body.ok).toBe(true);
    expect(remove.body.lore).not.toContain('MEME');
  });

  it('ends the season when the assassin is flipped', async () => {
    context.appVersion = '0.0.1.8';
    const boot = await get<ClientSession>('/init');
    const priv = (await getPrivateBoard(SEASON))!;
    const assassinId = priv.solution.find((s) => s.role === 'assassin')!.id;
    const current = boot.snapshot!.currentFaction as VisualFaction;
    asUser(await findActiveUser(current, 't2_se'));
    await post<VoteResponse>('/vote', { tileId: assassinId });
    await post<{ ok: boolean }>('/force-resolve');
    const state = await get<StateResponse>('/state');
    expect(state.snapshot?.seasonEnded).toBe(true);
    expect(state.snapshot?.endReason).toBe('assassin');
    expect(state.snapshot?.winner).toBeTruthy();
  });

  it('blocks force-resolve for non-moderators in production builds', async () => {
    context.appVersion = '0.0.1';
    await get<ClientSession>('/init');
    asUser('t2_user');
    const res = await post<{ ok: boolean; error?: string }>('/force-resolve');
    expect(res.status).toBe(403);
  });

  it('exposes player career stats on init for logged-in users', async () => {
    await get<ClientSession>('/init');
    asUser('t2_stats');
    const session = await get<ClientSession>('/init');
    expect(session.playerStats).toMatchObject({
      wins: 0,
      losses: 0,
      currentStreak: 0,
      bestStreak: 0,
    });
  });
});
