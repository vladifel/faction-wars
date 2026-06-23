/**
 * Nano Arcade endgame — CRT reacts to season outcome.
 */

import type { ClientSession } from '../../shared/api';
import type { BoardSnapshot, ThemeTokens } from '../../shared/types';
import { factionLabel } from '../../shared/theme';
import { nanoAssassinIcon, nanoEmblem } from '../assets/nanoSvg';
import {
  buildGameStats,
  endgameVariantToState,
  isMajorityVictory,
  renderEndgameOverlay,
  type EndgameVariant,
} from '../endgame';
import { el } from '../dom';
import { popScreen } from '../theme/ui';

export interface EndgameViewProps {
  variant: EndgameVariant;
  session: ClientSession;
  snap: BoardSnapshot;
  theme: ThemeTokens;
  onRetry: () => void;
  /** Dedupe key for endgame SFX (season:turn:variant). */
  sfxKey: string;
}

function copyLine(variant: EndgameVariant, theme: ThemeTokens, snap: BoardSnapshot): string {
  switch (variant) {
    case 'victory': {
      const winner = snap.winner ?? 'red';
      const name = factionLabel(theme, winner).toUpperCase();
      if (snap.endReason === 'majority') {
        return `${name} // BOARD MAJORITY SECURED`;
      }
      return `${name} // SUPREMACY ACHIEVED`;
    }
    case 'defeat':
      return 'CRITICAL SYSTEM FAILURE // GAME OVER';
    case 'assassin':
      return 'TERMINAL GLITCH // VIRUS DETECTED';
    case 'stalemate':
      return 'SYSTEM STALEMATE // REBOOT REQUIRED';
  }
}

function renderMarquee(text: string, variant: EndgameVariant): HTMLElement {
  return el('div', { class: `endgame-marquee endgame-marquee--${variant}` }, [
    el('div', { class: 'endgame-marquee__track' }, [
      el('span', { class: 'endgame-marquee__text' }, [text]),
      el('span', { class: 'endgame-marquee__text', 'aria-hidden': 'true' }, [text]),
    ]),
  ]);
}

function overlayHeadline(
  variant: EndgameVariant,
  theme: ThemeTokens,
  snap: BoardSnapshot,
): string {
  switch (variant) {
    case 'victory': {
      const winner = snap.winner ?? 'red';
      if (snap.endReason === 'majority') {
        return `${factionLabel(theme, winner).toUpperCase()} // BOARD MAJORITY`;
      }
      return `${factionLabel(theme, winner).toUpperCase()} // SUPREMACY ACHIEVED`;
    }
    case 'defeat':
      return 'SYSTEM FAILURE';
    case 'assassin':
      return 'TERMINAL GLITCH';
    case 'stalemate':
      return 'SYSTEM STALEMATE';
  }
}

function renderCenterVisual(
  variant: EndgameVariant,
  snap: BoardSnapshot,
  theme: ThemeTokens,
  session: EndgameViewProps['session'],
  stats: ReturnType<typeof buildGameStats>,
  onRetry: () => void,
  sfxKey: string,
): HTMLElement {
  const stage = el('div', { class: 'endgame-stage' });
  const majorityWin = variant === 'victory' && isMajorityVictory(snap);
  const winner = snap.winner;

  const grid = el('div', {
    class: `endgame-grid${majorityWin && winner ? ' endgame-grid--majority' : ''}`,
    ...(majorityWin && winner ? { 'data-winner': winner } : {}),
  }, []);

  for (const tile of snap.tiles) {
    grid.append(
      el('div', {
        class: 'endgame-grid__cell',
        ...(tile.isFlipped && tile.revealedRole ? { 'data-role': tile.revealedRole } : {}),
      }),
    );
  }
  stage.append(grid);

  const overlayState = endgameVariantToState(variant);
  const overlayChildren: (Node | string)[] = [];

  if (variant === 'victory' && winner) {
    overlayChildren.push(
      el('div', { class: 'endgame-emblem endgame-emblem--hero' }, [
        nanoEmblem(winner, 'endgame-emblem__svg'),
      ]),
    );
  } else if (variant === 'assassin') {
    overlayChildren.push(
      el('div', { class: 'endgame-assassin endgame-assassin--hero' }, [
        nanoAssassinIcon('endgame-assassin__svg'),
      ]),
    );
  } else if (variant === 'stalemate') {
    overlayChildren.push(el('div', { class: 'endgame-stalemate-mark' }, ['= = =']));
  }

  stage.append(
    renderEndgameOverlay(overlayState, {
      headline: overlayHeadline(variant, theme, snap),
      accentColor:
        variant === 'victory' && winner === 'blue'
          ? 'var(--nano-coconut)'
          : undefined,
      stats,
      careerStats: session.playerStats,
      onRetry,
      children: overlayChildren.length ? overlayChildren : undefined,
    }),
  );

  // SFX handled in main.mountEndgame via sfxKey
  void sfxKey;

  return stage;
}

/** Full-cabinet endgame takeover. */
export function renderEndgameView(props: EndgameViewProps): HTMLElement {
  const { variant, session, snap, theme, onRetry, sfxKey } = props;
  const headline = copyLine(variant, theme, snap);
  const stats = buildGameStats(snap, session.visualFaction);
  const majorityWin = variant === 'victory' && isMajorityVictory(snap);

  return popScreen('sky', [
    el('div', {
      class: [
        'endgame',
        `endgame--${variant}`,
        majorityWin ? 'endgame--majority' : '',
      ].filter(Boolean).join(' '),
      ...(variant === 'victory' && snap.winner ? { 'data-winner': snap.winner } : {}),
    }, [
      renderMarquee(headline, variant),
      renderCenterVisual(variant, snap, theme, session, stats, onRetry, sfxKey),
      el('p', { class: 'endgame-copy' }, [headline]),
      el('p', { class: 'endgame-meta' }, [
        `SEASON ${snap.season.replace(/^s_/, '').slice(0, 8).toUpperCase()} · TURN ${snap.turn}`,
      ]),
    ]),
  ], { class: 'endgame-screen pop-screen--center' });
}
