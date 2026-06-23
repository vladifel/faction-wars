/**
 * Client <-> server endpoint contracts.
 *
 * The client talks to the server purely over `/api/*` fetch calls; these types
 * are the request/response payloads for those calls plus the realtime message
 * shape pushed over the post's channel.
 */

import type {
  BoardSnapshot,
  GameStatus,
  PlayerStatsSummary,
  SubConfig,
  TileRole,
  VisualFaction,
} from './types';

export type { PlayerStatsSummary };

/** Full bootstrap payload returned by `GET /api/init`. Everything the route
 * machine needs for the first paint. Client-safe (no solution). */
export interface ClientSession {
  ok: boolean;
  error?: string;
  postId: string;
  season: string;
  turn: number;
  /** Branding + pacing config (solution-free, safe to expose). */
  config: SubConfig;
  status: GameStatus;
  snapshot: BoardSnapshot | null;
  /** The team the viewer is shown (fake for suppressed accounts). */
  visualFaction: VisualFaction;
  trusted: boolean;
  voteWeight: number;
  factionPopulation: number;
  isCommander: boolean;
  /** True when the viewer's faction is the one to move this turn. */
  isActiveFaction: boolean;
  /** Tile the viewer voted for this turn, when logged in and already voted. */
  myVoteTileId?: string | null;
  loggedIn: boolean;
  /** Cross-season record for logged-in users. */
  playerStats?: PlayerStatsSummary;
  /** True under `devvit playtest` — enables solo-test UI affordances. */
  devPlaytest?: boolean;
}

export interface NewGameResponse {
  ok: boolean;
  postId?: string;
  navigateTo?: string;
  error?: string;
}

export interface VoteRequest {
  tileId: string;
}

export interface VoteResponse {
  success: boolean;
  voteCount?: number;
  /** Refreshed snapshot so the client can reconcile immediately. */
  snapshot?: BoardSnapshot | null;
  /** Confirmed vote target for this turn (present on success). */
  myVoteTileId?: string | null;
  error?: string;
}

export interface ClueRequest {
  word: string;
  count: number;
}

export interface ClueResponse {
  success: boolean;
  snapshot?: BoardSnapshot | null;
  error?: string;
}

export interface VetoResponse {
  success: boolean;
  clueDiscarded: boolean;
  penalized: boolean;
  snapshot?: BoardSnapshot | null;
  error?: string;
}

export interface ClaimCommanderResponse {
  success: boolean;
  isCommander: boolean;
  error?: string;
}

/** Commander-only x-ray tile (word + hidden role). */
export interface CommanderXrayTile {
  id: string;
  word: string;
  role: TileRole;
}

export interface CommanderXrayResponse {
  ok: boolean;
  tiles?: CommanderXrayTile[];
  error?: string;
}

/** `POST /api/state` - cheap re-poll fallback when realtime is unavailable. */
export interface StateResponse {
  snapshot: BoardSnapshot | null;
  status: GameStatus;
  nextPostId?: string;
  /** Same as snapshot.livePostId when resolved and behind the live turn. */
  livePostId?: string;
  /** Tile the viewer voted for this turn, when logged in and already voted. */
  myVoteTileId?: string | null;
}

/** `GET /api/retry-target` — where RETRY should navigate after endgame. */
export interface RetryTargetResponse {
  ok: boolean;
  /** `live_post` when a newer war room exists; else subreddit listing. */
  target: 'live_post' | 'subreddit';
  navigateTo: string;
  postId?: string;
}

/** Realtime message broadcast on channel `fw:{postId}` whenever turn state
 * changes. Clients re-fetch `/api/state` (or apply the inlined snapshot). */
export interface RealtimeUpdate {
  type: 'snapshot' | 'resolved';
  turn: number;
  versionHash: string;
  snapshot?: BoardSnapshot;
  nextPostId?: string;
  /** One-hop target for tombstones (season current turn). */
  livePostId?: string;
}
