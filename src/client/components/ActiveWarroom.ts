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
  popBar,
  popBarCenter,
  popBoard,
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
}

function renderHeader(props: ActiveWarroomProps): HTMLElement {
  const { session, snap, theme } = props;
  const mine = session.visualFaction;

  const bar = popBar([
    popBadge('red', snap.scores.red, factionTag(theme, 'red').toUpperCase(), snap.currentFaction === 'red'),
    popBarCenter([
      el('span', { class: 'pop-bar__time' }, [
        snap.status === 'RESOLVED' ? 'TURN OVER' : formatRemaining(snap.turnEndTime),
      ]),
      el('span', { class: 'pop-bar__meta' }, [
        `T${snap.turn} · `,
        session.isActiveFaction
          ? `${factionTag(theme, mine).toUpperCase()} MOVE`
          : 'ENEMY MOVE',
      ]),
    ]),
    popBadge('blue', snap.scores.blue, factionTag(theme, 'blue').toUpperCase(), snap.currentFaction === 'blue'),
  ]);

  if (session.isActiveFaction && snap.status === 'ACTIVE' && session.trusted) {
    bar.append(
      popIconBtn('Command menu', { faction: mine, onclick: props.onCommandOpen }),
    );
  }

  return bar;
}

function renderFloatingClue(snap: BoardSnapshot): HTMLElement | null {
  const c = snap.activeClue;
  if (!c) return null;
  return popClueHud([
    el('span', { class: 'pop-clue__label' }, ['CLUE']),
    el('span', { class: 'pop-clue__word' }, [c.word]),
    el('span', { class: 'pop-clue__count' }, [`× ${c.count}`]),
  ]);
}

function renderBoard(props: ActiveWarroomProps): HTMLElement {
  const { session, snap, votedTileId, pendingTileId, boardDeal, flickerTileIds = [] } = props;
  const flicker = new Set(flickerTileIds);
  const voteTeamColor = factionColor(snap.currentFaction);
  const canVote =
    session.loggedIn &&
    session.trusted &&
    session.isActiveFaction &&
    snap.status === 'ACTIVE' &&
    !votedTileId;

  const grid = popBoard([]);
  if (boardDeal) grid.classList.add('pop-board--deal');
  for (let i = 0; i < snap.tiles.length; i++) {
    const tile = snap.tiles[i]!;
    grid.append(
      renderGridTile({
        tile,
        voteTeamColor,
        canVote,
        voted: votedTileId === tile.id,
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
  const clue = renderFloatingClue(props.snap);

  const root = popScreen('sky', [
    el('div', { class: 'warroom__body' }, [
      renderHeader(props),
      el('div', { class: 'warroom__stage' }, [renderBoard(props)]),
    ]),
  ], { class: 'warroom warroom--arcade' });

  if (clue) root.append(clue);
  return root;
}
