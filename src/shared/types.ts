/**
 * Faction Warfare - shared type definitions.
 *
 * Single source of truth for every payload that travels between the client,
 * the server endpoints, and Redis. Framework-agnostic: no Devvit imports, no
 * runtime logic - only types and small const enums.
 */

/** Runtime schema version. Bump when a stored JSON shape changes; migrations
 * upgrades older payloads to this version on read. */
export const SCHEMA_VERSION = 3 as const;

/** Number of tiles per side of the board (5x5). */
export const BOARD_SIZE = 5 as const;
export const BOARD_TILE_COUNT = BOARD_SIZE * BOARD_SIZE; // 25

/** The true faction a user belongs to. `shadowbanned` users are silently
 * suppressed but shown a believable `visualFaction` to deter bot sabotage. */
export type FactionId = 'red' | 'blue' | 'shadowbanned';

/** A faction that can actually be displayed on the board. */
export type VisualFaction = 'red' | 'blue';

/** Why a season ended (when `seasonEnded` is true). */
export type SeasonEndReason = 'assassin' | 'tiles' | 'stalemate' | 'majority';

/** Lifecycle state of a single game post / turn frame. */
export type GameStatus = 'ACTIVE' | 'RESOLVED';

/** The hidden allegiance of a tile (the solution key). */
export type TileRole = 'red' | 'blue' | 'neutral' | 'assassin';

/** Which screen the root route machine should render. */
export type RouteState =
  | 'LOADING'
  | 'ERROR'
  | 'GATE'
  | 'ACTIVE_WARROOM'
  | 'COMMANDER_CONSOLE'
  | 'TOMBSTONE'
  | 'ENDGAME';

/** Funnel telemetry steps for the developer dashboard. */
export type FunnelStep =
  | 'post_view'
  | 'gate_enter'
  | 'vote_cast'
  | 'clue_dispatched'
  | 'faction_assigned';

// ---------------------------------------------------------------------------
// Board model
// ---------------------------------------------------------------------------

/** Client-safe tile. The hidden `role` is NEVER present here unless the tile
 * has been flipped (at which point its role is public knowledge). */
export interface PublicTile {
  id: string;
  word: string;
  voteCount: number;
  isFlipped: boolean;
  /** Only populated once the tile is flipped; reveals what it actually was. */
  revealedRole?: TileRole;
}

/** Solution entry kept strictly server-side. */
export interface SolutionTile {
  id: string;
  role: TileRole;
}

/** Master board state (words + flipped tiles + meta). Stored at
 * `board:public:{turn}`. */
export interface PublicBoard {
  schema_version: number;
  season: string;
  /** Monotonically increasing turn number within a season. */
  turn: number;
  /** The Reddit post id that hosts this turn frame. */
  postId: string;
  status: GameStatus;
  /** Whose move it currently is. */
  currentFaction: VisualFaction;
  /** Epoch millis at which the current turn auto-resolves. */
  turnEndTime: number;
  tiles: PublicTile[];
  scores: FactionScores;
  /** If RESOLVED, the post id players should be redirected to. */
  nextPostId?: string;
  /** Per-turn strike accounting for the active faction's vetoes. */
  vetoStrikes: number;
  /** True when the season ended on this frame (no further turns). */
  seasonEnded?: boolean;
  winner?: VisualFaction;
  endReason?: SeasonEndReason;
}

/** Solution matrix - hidden tile designations. Stored at
 * `board:private:{season}`. Must never be serialized to the client. */
export interface PrivateBoard {
  schema_version: number;
  season: string;
  turn: number;
  solution: SolutionTile[];
  /** Which faction was assigned the extra (9th) tile and thus moves first. */
  startingFaction: VisualFaction;
  /** Epoch millis when the season's first turn was created. */
  seasonStartedAt?: number;
}

/** Remaining tiles each faction must still reveal to win. */
export interface FactionScores {
  red: number;
  blue: number;
}

/** Post-game stats compiled when a season ends. */
export interface EndgameStats {
  tilesCaptured: number;
  totalTiles: number;
  timeElapsedMs: number;
  factionEfficiencyPct: number;
  virusTriggered: boolean;
}

/** Flattened, pre-compiled read payload polled by the UI. Stored at
 * `board:snapshot:{turn}` and regenerated on a debounce. O(1) string read. */
export interface BoardSnapshot {
  schema_version: number;
  season: string;
  turn: number;
  postId: string;
  status: GameStatus;
  currentFaction: VisualFaction;
  turnEndTime: number;
  tiles: PublicTile[];
  scores: FactionScores;
  nextPostId?: string;
  /** When RESOLVED and behind the live turn: one-hop jump target (not just +1). */
  livePostId?: string;
  /** Short status string for the news ticker. */
  ticker: string;
  /** The active clue (word + count) the coordinator dispatched, if any. */
  activeClue?: ActiveClue;
  /** Changes whenever any field above changes; lets the client skip no-op
   * re-renders by comparing against the last applied hash. */
  versionHash: string;
  /** Epoch millis the snapshot was compiled. */
  compiledAt: number;
  /** Present when the season ended on this frame. */
  seasonEnded?: boolean;
  winner?: VisualFaction;
  endReason?: SeasonEndReason;
  /** Epoch millis when the season began (turn 1). */
  seasonStartedAt?: number;
  /** Populated when `seasonEnded` is true. */
  endgameStats?: EndgameStats;
}

/** A coordinator's dispatched clue. */
export interface ActiveClue {
  word: string;
  count: number;
  faction: VisualFaction;
  dispatchedBy: string;
  dispatchedAt: number;
  /** Reddit comment id (t1_…) — clue text is reportable via normal comment tools. */
  commentId?: string;
  /** Permalink path for the clue comment on the war-room post. */
  commentPermalink?: string;
}

// ---------------------------------------------------------------------------
// Configuration / theming
// ---------------------------------------------------------------------------

/** Localized labels swapped in at render time (e.g. "The Light Roasts"). */
export interface ThemeLabels {
  /** Full team name shown in gate / assignments (e.g. "Pink Faction"). */
  redTeam: string;
  blueTeam: string;
  /** Short HUD tag — must match tile colors (e.g. "Pink", not "Red"). */
  redTag: string;
  blueTag: string;
  gameTitle: string;
  enterCta: string;
}

/** Visual design tokens. Raw colors live in config; components only ever read
 * resolved tokens via the theme engine. */
export interface ThemeTokens {
  primaryBg: string;
  secondaryBg: string;
  /** Resting face color of an un-flipped word tile. */
  unflippedTile: string;
  textColor: string;
  redColor: string;
  blueColor: string;
  neutralColor: string;
  assassinColor: string;
  labels: ThemeLabels;
}

/** Moderator-controlled pacing knobs. */
export interface PacingConfig {
  /** Length of a single turn window in seconds. */
  turnDurationSeconds: number;
  /** Fraction (0-1) of active voters needed to veto a clue. */
  vetoThreshold: number;
  /** Snapshot regeneration cadence in seconds. */
  snapshotIntervalSeconds: number;
}

/** Word bank sources for board assembly. */
export interface WordLists {
  /** Subreddit-specific "lore" / inside-joke words. */
  lore: string[];
}

/** Persistent per-subreddit configuration. Stored at
 * `config:subreddit:{subredditId}`. */
export interface SubConfig {
  schema_version: number;
  subredditId: string;
  theme: ThemeTokens;
  pacing: PacingConfig;
  words: WordLists;
  /** Account-trust gate thresholds. */
  trust: TrustConfig;
}

/** Pending (staged) config awaiting developer approval. */
export interface PendingSubConfig extends SubConfig {
  submittedBy: string;
  submittedAt: number;
}

/** Sybil-resistance thresholds for the trust gate. */
export interface TrustConfig {
  minAccountAgeDays: number;
  minKarma: number;
}

/** Outcome of a faction assignment / gate entry. */
export interface JoinResult {
  /** The faction shown to the user (fake for shadowbanned accounts). */
  visualFaction: VisualFaction;
  /** True if the account passed the trust gate. */
  trusted: boolean;
}

// ---------------------------------------------------------------------------
// Player meta-progression
// ---------------------------------------------------------------------------

/** Persistent cross-season stats. Stored at `stats:global:{userId}`. */
export interface GlobalStats {
  schema_version: number;
  userId: string;
  /** Display name; scrubbed to "[Deleted User]" on GDPR deletion. */
  username: string;
  wins: number;
  losses: number;
  votesCast: number;
  cluesDispatched: number;
  currentStreak: number;
  bestStreak: number;
  trophies: string[];
  /** Set true once a GDPR deletion has scrubbed identifying fields. */
  redacted?: boolean;
}

/** Client-safe career record exposed on session bootstrap. */
export interface PlayerStatsSummary {
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
}
