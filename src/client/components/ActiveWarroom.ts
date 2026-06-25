/**
 * Active war room — Pop UI layout.
 */

import type { ClientSession } from '../../shared/api';
import type { BoardSnapshot, ThemeTokens } from '../../shared/types';
import { factionTag } from '../../shared/theme';
import { formatRemaining } from '../../shared/strings';
import {
  factionColor,
  popBadge,
  popBoard,
  popBtn,
  popClueHud,
  popIconBtn,
  popScreen,
} from '../theme/ui';
import { el } from '../dom';
import { renderGridTile } from './GridTile';

export interface ActiveWarroomProps {
  session: ClientSession;
  snap: BoardSnapshot;
  theme: ThemeTokens;
  votedTileId: string | null;
  pendingTileId: string | null;
  /** One-shot tile deal-in when entering war room. */
  boardDeal?: boolean;
  /** Tile ids with active neon border sputter (max 2). */
  flickerTileIds?: readonly string[];
  onTileSelect: (tile: { id: string; word: string }) => void;
  onCommandOpen: () => void;
  onNewGame?: () => void;
}

function renderHeader(props: ActiveWarroomProps): HTMLElement {
  const { session, snap, theme } = props;
  const mine = session.visualFaction;
  const clue = snap.activeClue;

  const timeEl = el('span', { class: 'pop-bar__time' }, [
    snap.status === 'RESOLVED' ? 'TURN OVER' : formatRemaining(snap.turnEndTime),
  ]);
  const metaEl = el('span', { class: 'pop-bar__meta' }, [
    `T${snap.turn} · `,
    session.isActiveFaction
      ? `${factionTag(theme, mine).toUpperCase()} MOVE`
      : 'ENEMY MOVE',
  ]);

  const center = el('div', { class: 'warroom__hud-center' }, [
    el('div', { class: 'warroom__hud-clock' }, [timeEl, metaEl]),
  ]);

  if (clue) {
    const clueParts = [
      el('span', { class: 'pop-clue__label' }, ['CLUE']),
      el('span', { class: 'pop-clue__word' }, [clue.word]),
      el('span', { class: 'pop-clue__count' }, [`× ${clue.count}`]),
    ];
    if (clue.commentPermalink) {
      clueParts.push(
        el('a', {
          class: 'pop-clue__report',
          href: `https://www.reddit.com${clue.commentPermalink}`,
          target: '_blank',
          rel: 'noopener noreferrer',
          'aria-label': 'View clue comment on Reddit to report',
        }, ['Report']),
      );
    }
    const clueEl = popClueHud(clueParts);
    clueEl.classList.add('pop-clue--inline');
    center.insertBefore(clueEl, center.firstChild);
  }

  const right = el('div', { class: 'warroom__hud-right' }, [
    popBadge('blue', snap.scores.blue, factionTag(theme, 'blue').toUpperCase(), snap.currentFaction === 'blue'),
  ]);

  if (session.isActiveFaction && snap.status === 'ACTIVE' && session.trusted) {
    right.append(
      popIconBtn('Command menu', { faction: mine, onclick: props.onCommandOpen }),
    );
  }
  if (session.devPlaytest && props.onNewGame) {
    right.append(
      popBtn('NEW GAME', {
        variant: 'ghost',
        fullWidth: false,
        className: 'pop-bar__new-game pop-btn--compact',
        onclick: props.onNewGame,
      }),
    );
  }

  return el('header', { class: 'warroom__hud' }, [
    popBadge('red', snap.scores.red, factionTag(theme, 'red').toUpperCase(), snap.currentFaction === 'red'),
    center,
    right,
  ]);
}

function renderBoard(props: ActiveWarroomProps): HTMLElement {
  const { session, snap, votedTileId, pendingTileId, boardDeal, flickerTileIds = [] } = props;
  const flicker = new Set(flickerTileIds);
  const voteTeamColor = factionColor(snap.currentFaction);
  const hasVoted = !!votedTileId;
  const canVote =
    session.loggedIn &&
    session.trusted &&
    session.isActiveFaction &&
    snap.status === 'ACTIVE' &&
    !hasVoted;

  const grid = popBoard([]);
  if (boardDeal) grid.classList.add('pop-board--deal');
  if (hasVoted) grid.classList.add('pop-board--locked');
  for (let i = 0; i < snap.tiles.length; i++) {
    const tile = snap.tiles[i]!;
    grid.append(
      renderGridTile({
        tile,
        voteTeamColor,
        canVote,
        voted: votedTileId === tile.id,
        locked: hasVoted,
        pending: pendingTileId === tile.id,
        tileIndex: boardDeal ? i : undefined,
        glowLive: flicker.has(tile.id),
        onSelect: () => props.onTileSelect({ id: tile.id, word: tile.word }),
      }),
    );
  }
  return grid;
}

/** Full active-turn war room shell. */
export function renderActiveWarroom(props: ActiveWarroomProps): HTMLElement {
  return popScreen('sky', [
    el('div', { class: 'warroom__body' }, [
      renderHeader(props),
      el('div', { class: 'warroom__stage' }, [renderBoard(props)]),
    ]),
  ], { class: 'warroom warroom--arcade' });
}
