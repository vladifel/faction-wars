/**
 * "Level cleared" archive — inactive resolved turns in the feed.
 */

import type { BoardSnapshot } from '../../shared/types';
import { popBody, popBtn, popCard, popEyebrow, popScreen, popTitle } from '../theme/ui';

export interface TombstoneViewProps {
  snap: BoardSnapshot;
  onJumpLive: (postId: string) => void;
}

/** Frozen turn frame with one-hop jump to the live war room. */
export function renderTombstoneView(props: TombstoneViewProps): HTMLElement {
  const { snap, onJumpLive } = props;
  const jump = snap.livePostId ?? snap.nextPostId;

  return popScreen('muted', [
    popCard([
      popEyebrow('LEVEL CLEARED'),
      popTitle('TURN RESOLVED.', 'xl'),
      popBody(snap.ticker, 'pop-body--center pop-body--muted'),
      jump
        ? popBtn('JUMP TO LIVE TURN ➡️', {
            variant: 'primary',
            faction: 'blue',
            onclick: () => onJumpLive(jump),
          })
        : popBody('AWAITING THE NEXT FRONT…', 'pop-body--meta'),
    ]),
  ], { class: 'pop-screen--center' });
}
