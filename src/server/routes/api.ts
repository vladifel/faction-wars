/**
 * Client-facing game API (`/api/*`).
 *
 * The webview drives all gameplay through these JSON endpoints. Every action
 * runs lazy turn resolution first so an expired turn self-heals on contact.
 */

import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type {
  ClaimCommanderResponse,
  CommanderXrayResponse,
  ClientSession,
  ClueRequest,
  ClueResponse,
  NewGameResponse,
  RetryTargetResponse,
  StateResponse,
  VetoResponse,
  VoteRequest,
  VoteResponse,
} from '../../shared/api';
import type { SubConfig, TileRole } from '../../shared/types';
import { getPublicBoard, getPrivateBoard } from '../boardService';
import { getSubConfig } from '../config';
import {
  assignFaction,
  getAssignedFaction,
  getFactionCounts,
  visualFactionFor,
} from '../factionService';
import { keys } from '../keys';
import { spawnNextPost as spawnNextPostImpl, createPost } from '../post';
import { isDevPlaytest } from '../devMode';
import { redis } from '@devvit/web/server';
import { buildSessionBundle, claimCommander, getCommander } from '../sessionService';
import { resolveRetryNavigateUrl } from '../livePostService';
import { compileSnapshot, readSnapshot } from '../snapshotService';
import { broadcastUpdate } from '../realtimeService';
import {
  ensureTurnFresh,
  registerVetoStrike,
  resolveAndAdvance,
  type SpawnNextPost,
} from '../turnService';
import { castVote, dispatchClue, getActiveClue, getMyVoteTileId, vetoClue } from '../voteService';
import {
  addLoreWord,
  listLoreWords,
  removeLoreWord,
  sanitizeLoreList,
} from '../loreService';
import { requireModerator } from '../modAuth';
import { validateClueCount, validateClueWord, clueConflictsWithBoard } from '../../shared/validators';

export const api = new Hono();

/** Bind the next-post spawner to the current subreddit. */
function spawner(subredditId: string): SpawnNextPost {
  return (a) => spawnNextPostImpl({ ...a, subredditId });
}

interface Binding {
  subredditId: string;
  postId: string;
  userId: string | undefined;
  season: string;
  turn: number;
  config: SubConfig;
}

/** Resolve the post-bound season/turn, healing expired turns inline. */
async function loadBinding(): Promise<Binding | null> {
  const subredditId = context.subredditId;
  const postId = context.postId;
  if (!subredditId || !postId) return null;

  const raw = await redis.get(keys.postContext(postId));
  if (!raw) return null;
  const { season, turn } = JSON.parse(raw) as { season: string; turn: number };

  const config = await getSubConfig(subredditId);
  // Heal expired turn for this post's bound frame; never advance the binding turn.
  await ensureTurnFresh({
    season,
    turn,
    config,
    spawnNextPost: spawner(subredditId),
  });

  return { subredditId, postId, userId: context.userId, season, turn, config };
}

/** GET /api/init - full bootstrap bundle for first paint. */
api.get('/init', async (c) => {
  const subredditId = context.subredditId;
  const session = await buildSessionBundle(
    subredditId ? spawner(subredditId) : undefined,
  );
  return c.json<ClientSession>(session, 200);
});

/** GET /api/retry-target - endgame RETRY navigation target. */
api.get('/retry-target', async (c) => {
  const subredditId = context.subredditId;
  const postId = context.postId;
  const subredditName = context.subredditName ?? 'all';
  if (!subredditId || !postId) {
    return c.json<RetryTargetResponse>(
      { ok: false, target: 'subreddit', navigateTo: `https://reddit.com/r/${subredditName}` },
      400,
    );
  }
  const resolved = await resolveRetryNavigateUrl({
    subredditId,
    subredditName,
    currentPostId: postId,
  });
  return c.json<RetryTargetResponse>({ ok: true, ...resolved }, 200);
});

/** POST /api/new-game - spawn a fresh war-room post (playtest or moderator). */
api.post('/new-game', async (c) => {
  const subredditId = context.subredditId;
  const subredditName = context.subredditName ?? 'all';
  if (!subredditId) {
    return c.json<NewGameResponse>({ ok: false, error: 'No subreddit context.' }, 400);
  }

  const mod = await requireModerator();
  if (!isDevPlaytest() && !mod.ok) {
    return c.json<NewGameResponse>(
      { ok: false, error: mod.error ?? 'Moderator access only.' },
      mod.error === 'Not logged in.' ? 401 : 403,
    );
  }

  try {
    const post = await createPost(subredditId);
    const slug = post.id.replace(/^t3_/, '');
    const base = `https://www.reddit.com/r/${subredditName}/comments/${slug}/`;
    const navigateTo = isDevPlaytest() ? `${base}?playtest=faction-warfare` : base;
    return c.json<NewGameResponse>({ ok: true, postId: post.id, navigateTo }, 200);
  } catch (err) {
    console.error(`Failed to create war room: ${err}`);
    return c.json<NewGameResponse>({ ok: false, error: 'Failed to create a new war room.' }, 500);
  }
});

/** GET /api/state - cheap re-poll fallback (realtime safety net). */
api.get('/state', async (c) => {
  const b = await loadBinding();
  if (!b) return c.json<StateResponse>({ snapshot: null, status: 'ACTIVE' }, 200);
  const board = await getPublicBoard(b.season, b.turn);
  const snapshot = await readSnapshot({ season: b.season, turn: b.turn, maxAgeMs: 0 });
  const myVoteTileId = await getMyVoteTileId(b.season, b.turn, b.userId);
  return c.json<StateResponse>(
    {
      snapshot,
      status: board?.status ?? 'ACTIVE',
      nextPostId: board?.nextPostId,
      livePostId: snapshot?.livePostId,
      myVoteTileId,
    },
    200,
  );
});

/** Resolve the viewer's visual faction for the season. */
async function viewerFaction(
  season: string,
  subredditId: string,
  userId: string | undefined,
  activeFaction?: 'red' | 'blue',
): Promise<{ faction: 'red' | 'blue'; trusted: boolean }> {
  if (!userId) return { faction: 'red', trusted: false };
  // Playtest override: act as the moving faction + trusted so actions go through.
  if (isDevPlaytest() && activeFaction) return { faction: activeFaction, trusted: true };
  const stored = await getAssignedFaction(season, userId);
  if (stored) {
    return {
      faction: visualFactionFor(stored, userId),
      trusted: stored !== 'shadowbanned',
    };
  }
  const join = await assignFaction({
    season,
    subredditId,
    userId,
    trust: (await getSubConfig(subredditId)).trust,
  });
  return { faction: join.visualFaction, trusted: join.trusted };
}

/** POST /api/vote - cast a vote for a tile this turn. */
api.post('/vote', async (c) => {
  const b = await loadBinding();
  if (!b || !b.userId) {
    return c.json<VoteResponse>({ success: false, error: 'Not logged in.' }, 401);
  }
  const { tileId } = await c.req.json<VoteRequest>();
  if (!tileId) return c.json<VoteResponse>({ success: false, error: 'Missing tile.' }, 400);

  const board = await getPublicBoard(b.season, b.turn);
  if (!board || board.status !== 'ACTIVE') {
    return c.json<VoteResponse>({ success: false, error: 'Turn is closed.' }, 409);
  }

  const { faction, trusted } = await viewerFaction(
    b.season,
    b.subredditId,
    b.userId,
    board.currentFaction,
  );
  if (faction !== board.currentFaction) {
    return c.json<VoteResponse>(
      { success: false, error: 'Your faction is not on the move.' },
      403,
    );
  }

  const result = await castVote({
    season: b.season,
    turn: b.turn,
    subredditId: b.subredditId,
    tileId,
    userId: b.userId,
    weight: trusted ? 1 : 0,
  });

  if (!result.success) {
    const clientError =
      result.error === 'Invalid tile.' || result.error === 'Tile already flipped.';
    if (clientError) {
      return c.json<VoteResponse>(
        { success: false, error: result.error, snapshot: null },
        400,
      );
    }
  }

  const snapshot = await compileSnapshot({ season: b.season, turn: b.turn });
  const myVoteTileId = await getMyVoteTileId(b.season, b.turn, b.userId);
  if (result.success && snapshot && b.postId) {
    await broadcastUpdate(b.postId, {
      type: 'snapshot',
      turn: b.turn,
      versionHash: snapshot.versionHash,
      snapshot,
    });
  }
  return c.json<VoteResponse>({
    success: result.success,
    voteCount: result.voteCount,
    snapshot,
    myVoteTileId,
    error: result.error,
  });
});

/** GET /api/commander-xray - solution board for the active commander only. */
api.get('/commander-xray', async (c) => {
  const b = await loadBinding();
  if (!b?.userId) {
    return c.json<CommanderXrayResponse>({ ok: false, error: 'Not logged in.' }, 200);
  }

  const board = await getPublicBoard(b.season, b.turn);
  const priv = await getPrivateBoard(b.season);
  if (!board || !priv || board.status !== 'ACTIVE') {
    return c.json<CommanderXrayResponse>({ ok: false, error: 'No active board.' }, 200);
  }

  const { faction } = await viewerFaction(
    b.season,
    b.subredditId,
    b.userId,
    board.currentFaction,
  );
  const commander = await getCommander(b.season, b.turn, faction);
  if (commander !== b.userId) {
    return c.json<CommanderXrayResponse>({ ok: false, error: 'Commander access only.' }, 200);
  }

  const roleById = new Map(priv.solution.map((s) => [s.id, s.role]));
  const tiles = board.tiles.map((t) => ({
    id: t.id,
    word: t.word,
    role: (roleById.get(t.id) ?? 'neutral') as TileRole,
  }));

  return c.json<CommanderXrayResponse>({ ok: true, tiles }, 200);
});

/** POST /api/clue - dispatch a coordinator clue (commander only). */
api.post('/clue', async (c) => {
  const b = await loadBinding();
  if (!b || !b.userId) {
    return c.json<ClueResponse>({ success: false, error: 'Not logged in.' }, 401);
  }
  const body = await c.req.json<ClueRequest>();
  const word = validateClueWord(body.word);
  const count = validateClueCount(body.count);
  if (!word.valid) return c.json<ClueResponse>({ success: false, error: word.error }, 400);
  if (!count.valid) return c.json<ClueResponse>({ success: false, error: count.error }, 400);

  const board = await getPublicBoard(b.season, b.turn);
  if (!board || board.status !== 'ACTIVE') {
    return c.json<ClueResponse>({ success: false, error: 'Turn is closed.' }, 409);
  }

  const { faction } = await viewerFaction(
    b.season,
    b.subredditId,
    b.userId,
    board.currentFaction,
  );
  if (faction !== board.currentFaction) {
    return c.json<ClueResponse>(
      { success: false, error: 'Your faction is not on the move.' },
      403,
    );
  }
  if (clueConflictsWithBoard(word.value!, board.tiles.map((t) => t.word))) {
    return c.json<ClueResponse>(
      { success: false, error: 'Clue cannot match or overlap a board word.' },
      400,
    );
  }
  const commander = await getCommander(b.season, b.turn, faction);
  if (commander && commander !== b.userId) {
    return c.json<ClueResponse>(
      { success: false, error: 'Another commander leads this turn.' },
      403,
    );
  }

  await dispatchClue({
    season: b.season,
    turn: b.turn,
    subredditId: b.subredditId,
    faction,
    userId: b.userId,
    word: word.value!,
    count: Number(count.value),
  });

  const snapshot = await compileSnapshot({ season: b.season, turn: b.turn });
  return c.json<ClueResponse>({ success: true, snapshot });
});

/** POST /api/veto - register a veto against the active clue. */
api.post('/veto', async (c) => {
  const b = await loadBinding();
  if (!b || !b.userId) {
    return c.json<VetoResponse>(
      { success: false, clueDiscarded: false, penalized: false, error: 'Not logged in.' },
      401,
    );
  }

  const board = await getPublicBoard(b.season, b.turn);
  const clue = await getActiveClue(b.season, b.turn);
  if (!board || board.status !== 'ACTIVE' || !clue) {
    return c.json<VetoResponse>(
      { success: false, clueDiscarded: false, penalized: false, error: 'Nothing to veto.' },
      409,
    );
  }

  const { faction, trusted } = await viewerFaction(
    b.season,
    b.subredditId,
    b.userId,
    board.currentFaction,
  );
  if (!trusted || faction !== board.currentFaction) {
    return c.json<VetoResponse>(
      { success: false, clueDiscarded: false, penalized: false, error: 'Cannot veto now.' },
      403,
    );
  }

  const counts = await getFactionCounts();
  const activePlayers = faction === 'red' ? counts.red : counts.blue;
  const outcome = await vetoClue({
    season: b.season,
    turn: b.turn,
    userId: b.userId,
    activePlayers,
    vetoThreshold: b.config.pacing.vetoThreshold,
  });

  let penalized = false;
  if (outcome.clueDiscarded) {
    const strike = await registerVetoStrike({
      season: b.season,
      turn: b.turn,
      config: b.config,
      spawnNextPost: spawner(b.subredditId),
    });
    penalized = strike.penalized;
  }

  const snapshot = await compileSnapshot({ season: b.season, turn: b.turn });
  return c.json<VetoResponse>({
    success: outcome.accepted,
    clueDiscarded: outcome.clueDiscarded,
    penalized,
    snapshot,
  });
});

/** POST /api/claim-commander - claim the coordinator role for this turn. */
api.post('/claim-commander', async (c) => {
  const b = await loadBinding();
  if (!b || !b.userId) {
    return c.json<ClaimCommanderResponse>(
      { success: false, isCommander: false, error: 'Not logged in.' },
      401,
    );
  }
  const board = await getPublicBoard(b.season, b.turn);
  const { faction, trusted } = await viewerFaction(
    b.season,
    b.subredditId,
    b.userId,
    board?.currentFaction,
  );
  if (!trusted) {
    return c.json<ClaimCommanderResponse>(
      { success: false, isCommander: false, error: 'Account not eligible.' },
      403,
    );
  }
  const claimed = await claimCommander({
    season: b.season,
    turn: b.turn,
    faction,
    userId: b.userId,
  });
  return c.json<ClaimCommanderResponse>({ success: true, isCommander: claimed });
});

interface ModLoreRequest {
  action: 'list' | 'add' | 'remove' | 'sanitize';
  word?: string;
}

interface ModLoreResponse {
  ok: boolean;
  lore?: string[];
  error?: string;
  removed?: number;
}

/** POST /api/mod/lore — moderator lore word list management. */
api.post('/mod/lore', async (c) => {
  const gate = await requireModerator();
  if (!gate.ok) {
    return c.json<ModLoreResponse>({ ok: false, error: gate.error }, gate.error === 'Not logged in.' ? 401 : 403);
  }
  const subredditId = context.subredditId;
  if (!subredditId) {
    return c.json<ModLoreResponse>({ ok: false, error: 'Missing subreddit.' }, 400);
  }

  const body = await c.req.json<ModLoreRequest>();
  switch (body.action) {
    case 'list': {
      const lore = await listLoreWords(subredditId);
      return c.json<ModLoreResponse>({ ok: true, lore });
    }
    case 'add': {
      const res = await addLoreWord(subredditId, body.word ?? '');
      return c.json<ModLoreResponse>(
        { ok: res.ok, lore: res.lore, error: res.error },
        res.ok ? 200 : 400,
      );
    }
    case 'remove': {
      const res = await removeLoreWord(subredditId, body.word ?? '');
      return c.json<ModLoreResponse>(
        { ok: res.ok, lore: res.lore, error: res.error, removed: res.removed },
        res.ok ? 200 : 400,
      );
    }
    case 'sanitize': {
      const res = await sanitizeLoreList(subredditId);
      return c.json<ModLoreResponse>({ ok: true, lore: res.lore, removed: res.removed });
    }
    default:
      return c.json<ModLoreResponse>({ ok: false, error: 'Unknown action.' }, 400);
  }
});

/** POST /api/force-resolve - dev playtest or moderator manual resolve. */
api.post('/force-resolve', async (c) => {
  if (!isDevPlaytest()) {
    const mod = await requireModerator();
    if (!mod.ok) {
      return c.json({ ok: false, error: mod.error }, 403);
    }
  }
  const b = await loadBinding();
  if (!b) return c.json({ ok: false }, 400);
  await resolveAndAdvance({
    season: b.season,
    turn: b.turn,
    config: b.config,
    spawnNextPost: spawner(b.subredditId),
  });
  return c.json({ ok: true });
});
