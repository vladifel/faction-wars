/**
 * Pop UI vote confirmation bottom sheet.
 * No full-screen scrim — board stays fully visible; sheet floats at bottom.
 */

import type { ClientSession } from '../../shared/api';
import type { BoardSnapshot } from '../../shared/types';
import {
  factionColor,
  popBtn,
  popHeading,
  popSheet,
  popSheetBack,
  popSheetHandle,
} from '../theme/ui';
import { el } from '../dom';

export interface VoteConfirmSheetProps {
  session: ClientSession;
  snap: BoardSnapshot;
  tileId: string;
  word: string;
  busy: boolean;
  onConfirm: () => void;
  onVeto: () => void;
  onCancel: () => void;
}

/** Bottom sheet node — append to `#app` while war room stays mounted behind it. */
export function renderVoteConfirmSheet(props: VoteConfirmSheetProps): HTMLElement {
  const { session, snap, word, busy, onConfirm, onVeto, onCancel } = props;
  const faction = session.visualFaction;

  const actions = el('div', { class: 'pop-sheet__actions' }, [
    popBtn(`LOCK IN ${word}`, {
      variant: 'primary',
      faction,
      disabled: busy,
      onclick: onConfirm,
    }),
  ]);

  if (snap.activeClue && session.isActiveFaction && session.trusted) {
    actions.append(
      popBtn("VETO COMMANDER'S CLUE", {
        variant: 'ghost',
        disabled: busy,
        onclick: onVeto,
      }),
    );
  }

  actions.append(
    popBtn('NEVER MIND', { variant: 'secondary', onclick: onCancel }),
  );

  return popSheet([
    el('div', { class: 'pop-sheet__head' }, [
      popSheetBack('← BACK', onCancel),
    ]),
    popSheetHandle(onCancel),
    el('p', {
      class: 'pop-sheet__eyebrow',
      style: `color:${factionColor(faction)}`,
    }, ['CAST YOUR VOTE']),
    popHeading(word),
    actions,
  ], { id: 'action-sheet' });
}
