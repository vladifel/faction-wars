import type { BoardSnapshot, EndgameStats, PlayerStatsSummary, VisualFaction } from '../shared/types';
import {
  countTerritory,
  factionEfficiencyPct,
  factionTilesCaptured,
  formatElapsed,
} from '../shared/endgameLogic';
import { el } from './dom';
import { playEndgameSfx } from './audio';
import { popBtn } from './theme/ui';

export type EndgameVariant = 'victory' | 'defeat' | 'assassin' | 'stalemate';

/** Arcade overlay states — maps to `.arcade-overlay` modifiers. */
export type EndgameOverlayState = 'WIN' | 'LOSS' | 'GLITCH' | 'STALEMATE';

/** Post-game stats for the stats panel. */
export interface GameStats {
  factionTiles: number;
  totalTiles: number;
  timeElapsed: string;
  virusTriggered: boolean;
  tilesCaptured: number;
  factionEfficiencyPct: number;
}

export interface EndgameOverlayOptions {
  headline?: string;
  accentColor?: string;
  stats?: GameStats;
  careerStats?: PlayerStatsSummary;
  onRetry?: () => void;
  /** Extra nodes rendered inside the overlay (emblem, etc.). */
  children?: (Node | string)[];
}

/** Pick endgame screen variant from season outcome + viewer faction. */
export function resolveEndgameVariant(
  snap: BoardSnapshot,
  visualFaction: VisualFaction,
): EndgameVariant | null {
  if (!snap.seasonEnded) return null;
  if (snap.endReason === 'stalemate') return 'stalemate';
  if (snap.endReason === 'assassin') {
    if (snap.winner === visualFaction) return 'victory';
    return 'assassin';
  }
  if (snap.winner === visualFaction) return 'victory';
  return 'defeat';
}

/** Map rich endgame variant → arcade overlay state. */
export function endgameVariantToState(variant: EndgameVariant): EndgameOverlayState {
  switch (variant) {
    case 'victory':
      return 'WIN';
    case 'defeat':
      return 'LOSS';
    case 'assassin':
      return 'GLITCH';
    case 'stalemate':
      return 'STALEMATE';
  }
}

/** Build viewer-relative post-game stats from a terminal snapshot. */
export function buildGameStats(
  snap: BoardSnapshot,
  visualFaction: VisualFaction,
): GameStats {
  const territory = countTerritory(snap.tiles);
  const captured = factionTilesCaptured(territory, visualFaction);
  const elapsedMs =
    snap.endgameStats?.timeElapsedMs ??
    (snap.seasonStartedAt ? snap.compiledAt - snap.seasonStartedAt : 0);

  return {
    factionTiles: captured,
    totalTiles: territory.totalTiles,
    timeElapsed: formatElapsed(elapsedMs),
    virusTriggered: snap.endReason === 'assassin',
    tilesCaptured: captured,
    factionEfficiencyPct: factionEfficiencyPct(territory, visualFaction),
  };
}

function defaultHeadline(state: EndgameOverlayState): string {
  switch (state) {
    case 'WIN':
      return 'SUPREMACY ACHIEVED';
    case 'LOSS':
      return 'SYSTEM FAILURE';
    case 'GLITCH':
      return 'TERMINAL GLITCH';
    case 'STALEMATE':
      return 'SYSTEM STALEMATE';
  }
}

function defaultAccent(state: EndgameOverlayState): string {
  if (state === 'WIN') return 'var(--nano-banana)';
  if (state === 'STALEMATE') return 'var(--nano-neutral)';
  return 'var(--nano-virus)';
}

function renderStatsPanel(stats: GameStats, career?: PlayerStatsSummary): HTMLElement {
  const rows: HTMLElement[] = [
    el('div', { class: 'stats-panel__item' }, [
      el('span', { class: 'stats-panel__label' }, ['TOTAL TILES CAPTURED']),
      el('span', { class: 'stats-panel__value' }, [String(stats.tilesCaptured)]),
    ]),
    el('div', { class: 'stats-panel__item' }, [
      el('span', { class: 'stats-panel__label' }, ['TIME ELAPSED']),
      el('span', { class: 'stats-panel__value' }, [stats.timeElapsed]),
    ]),
    el('div', { class: 'stats-panel__item' }, [
      el('span', { class: 'stats-panel__label' }, ['FACTION EFFICIENCY']),
      el('span', { class: 'stats-panel__value' }, [`${stats.factionEfficiencyPct}%`]),
    ]),
  ];

  if (stats.virusTriggered) {
    rows.push(
      el('div', { class: 'stats-panel__item stats-panel__item--warning' }, [
        el('span', { class: 'stats-panel__label' }, ['VIRUS DETECTED']),
      ]),
    );
  }

  if (career) {
    rows.push(
      el('div', { class: 'stats-panel__item stats-panel__item--career' }, [
        el('span', { class: 'stats-panel__label' }, ['CAREER RECORD']),
        el('span', { class: 'stats-panel__value' }, [
          `${career.wins}W / ${career.losses}L · STREAK ${career.currentStreak} (BEST ${career.bestStreak})`,
        ]),
      ]),
    );
  }

  return el('div', { class: 'stats-panel' }, rows);
}

function renderOverlayRetry(onRetry?: () => void): HTMLElement {
  return el('div', { class: 'endgame-retry endgame-retry--overlay' }, [
    popBtn('RETRY', {
      variant: 'primary',
      className: 'pop-btn--arcade endgame-retry__btn retry-button',
      fullWidth: false,
      onclick: onRetry,
    }),
    el('div', {
      class: 'border-glow border-glow--live endgame-retry__glow',
      'aria-hidden': 'true',
    }),
  ]);
}

/** Build `.arcade-overlay` node — use alone or via `renderEndgame()`. */
export function renderEndgameOverlay(
  state: EndgameOverlayState,
  opts: EndgameOverlayOptions = {},
): HTMLElement {
  const classes = ['arcade-overlay', 'visible'];
  if (state === 'LOSS' || state === 'GLITCH') classes.push('shutdown');
  if (state === 'GLITCH') classes.push('glitch');
  if (state === 'STALEMATE') classes.push('stalemate');

  const headline = opts.headline ?? defaultHeadline(state);
  const accent = opts.accentColor ?? defaultAccent(state);

  const body: (Node | string)[] = [
    el('div', { class: 'power-off-line', 'aria-hidden': 'true' }),
    el('h1', {
      class: 'arcade-overlay__headline',
      style: `color:${accent}`,
    }, [headline]),
  ];

  if (opts.stats) body.push(renderStatsPanel(opts.stats, opts.careerStats));
  if (opts.children?.length) body.push(...opts.children);
  if (opts.onRetry) body.push(renderOverlayRetry(opts.onRetry));

  return el('div', { class: classes.join(' ') }, body);
}

/**
 * Mount arcade endgame overlay on a container when win/loss/glitch/stalemate is met.
 * Plays the appropriate SFX hook once per session key.
 */
export function renderEndgame(
  container: HTMLElement,
  state: EndgameOverlayState,
  stats: GameStats,
  opts: Omit<EndgameOverlayOptions, 'stats'> & { sessionKey?: string } = {},
): void {
  const sessionKey = opts.sessionKey ?? state;
  playEndgameSfx(state, sessionKey);
  container.append(
    renderEndgameOverlay(state, {
      ...opts,
      stats,
    }),
  );
}

/** True when victory came from board majority (not score wipe or assassin). */
export function isMajorityVictory(snap: BoardSnapshot): boolean {
  return snap.endReason === 'majority';
}

export type { EndgameStats };
