/**
 * Dark wireframe grid tile — Nano Arcade.
 * Open tiles stay dark; votes show as neon ring + badge.
 */

import type { PublicTile, TileRole } from '../../shared/types';
import { el } from '../dom';
import { nanoAssassinIcon } from '../assets/nanoSvg';

export interface GridTileProps {
  tile: PublicTile;
  /** Active faction color. */
  voteTeamColor: string;
  canVote: boolean;
  voted: boolean;
  /** Turn vote already cast — board is read-only until next turn. */
  locked?: boolean;
  /** Tile awaiting vote confirmation in the action sheet. */
  pending?: boolean;
  /** Tile index for one-shot deal-in animation (0–24). */
  tileIndex?: number;
  /** Neon border sputter active on this tile. */
  glowLive?: boolean;
  onSelect: () => void;
}

/** Render one board cell. */
export function renderGridTile(props: GridTileProps): HTMLElement {
  const { tile, voteTeamColor, canVote, voted, locked, pending, tileIndex, glowLive, onSelect } = props;
  const flipped = tile.isFlipped;
  const role = tile.revealedRole as TileRole | undefined;
  const interactive = canVote && !flipped && !voted && !locked;

  const classes = ['grid-tile'];
  if (!flipped) classes.push('grid-tile--open');
  if (flipped) classes.push('grid-tile--flipped');
  if (pending) classes.push('grid-tile--pending');
  if (voted) classes.push('grid-tile--voted');
  if (locked && !voted) classes.push('grid-tile--locked');

  const styleParts: string[] = [];
  if (voted || tile.voteCount > 0 || pending) {
    styleParts.push(`--vote-color:${voteTeamColor}`);
    styleParts.push(`color:${voteTeamColor}`);
  }
  if (tileIndex != null) {
    styleParts.push(`--tile-i:${tileIndex}`);
  }

  const root = el('button', {
    type: 'button',
    disabled: !interactive,
    class: classes.join(' '),
    'data-tile-id': tile.id,
    ...(flipped && role ? { 'data-role': role } : {}),
    ...(voted ? { 'aria-label': `${tile.word}, your vote` } : {}),
    style: styleParts.length ? styleParts.join(';') : undefined,
    onclick: () => {
      if (!interactive) return;
      onSelect();
    },
  });

  root.append(
    el('div', {
      class: glowLive ? 'border-glow border-glow--live' : 'border-glow',
      'aria-hidden': 'true',
    }),
  );

  root.append(
    flipped && role === 'assassin'
      ? el('span', { class: 'grid-tile__icon text-static' }, [nanoAssassinIcon()])
      : el('span', { class: 'grid-tile__word text-static' }, [tile.word]),
  );

  if ((tile.voteCount > 0 || voted) && !flipped) {
    root.append(
      el('span', { class: 'grid-tile__votes' }, [
        String(voted && tile.voteCount === 0 ? 1 : tile.voteCount),
      ]),
    );
  }

  return root;
}
