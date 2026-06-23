/**
 * Commander X-Ray visor — solution board on sky background.
 */

import type { ClientSession } from '../../shared/api';
import type { BoardSnapshot, ThemeTokens, TileRole } from '../../shared/types';
import { COMMANDER_CLUE_FORM } from '../forms/commanderForm';
import {
  factionColor,
  popBoard,
  popBody,
  popBtn,
  popField,
  popHeading,
  popScreen,
  popSheet,
  popSheetBack,
  popSheetHandle,
} from '../theme/ui';
import { el } from '../dom';

export interface XrayTile {
  id: string;
  word: string;
  role: TileRole;
}

export interface CommanderConsoleProps {
  session: ClientSession;
  snap: BoardSnapshot;
  theme: ThemeTokens;
  xrayTiles: XrayTile[] | null;
  loading: boolean;
  busy: boolean;
  cluePanelOpen: boolean;
  flickerTileIds?: readonly string[];
  onBack: () => void;
  onOpenCluePanel: () => void;
  onClaimCommand: () => void;
}

export interface CommanderClueSheetProps {
  session: ClientSession;
  busy: boolean;
  onClose: () => void;
  onDispatch: (word: string, count: number) => void;
}

function renderXrayTile(tile: XrayTile, glowLive: boolean): HTMLElement {
  return el('div', {
    class: 'xray-tile',
    'data-role': tile.role,
    'data-tile-id': tile.id,
  }, [
    el('div', {
      class: glowLive ? 'border-glow border-glow--live' : 'border-glow',
      'aria-hidden': 'true',
    }),
    el('span', { class: 'xray-tile__word text-static' }, [tile.word]),
  ]);
}

/** Bottom clue sheet — mount on `#app` (same layer as vote sheet). */
export function renderCommanderClueSheet(props: CommanderClueSheetProps): HTMLElement {
  const { session, busy, onClose, onDispatch } = props;
  const faction = session.visualFaction;

  const word = popField({
    type: 'text',
    maxlength: 24,
    placeholder: COMMANDER_CLUE_FORM.wordPlaceholder,
    id: 'commander-clue-word',
    'aria-label': COMMANDER_CLUE_FORM.wordLabel,
  });

  const count = popField({
    type: 'number',
    min: 0,
    max: 9,
    value: 1,
    id: 'commander-clue-count',
    class: 'pop-field--num',
    'aria-label': COMMANDER_CLUE_FORM.countLabel,
  });

  const dismiss = () => onClose();

  return popSheet([
    el('div', { class: 'pop-sheet__head' }, [
      popSheetBack('← BACK', dismiss),
    ]),
    popSheetHandle(dismiss),
    el('p', {
      class: 'pop-sheet__eyebrow',
      style: `color:${factionColor(faction)}`,
    }, ['COMMANDER CLUE']),
    popHeading(COMMANDER_CLUE_FORM.title),
    popBody(COMMANDER_CLUE_FORM.description, 'pop-body--center pop-body--muted'),
    el('div', { class: 'pop-sheet__fields' }, [word, count]),
    el('div', { class: 'pop-sheet__actions' }, [
      popBtn(COMMANDER_CLUE_FORM.acceptLabel, {
        variant: 'primary',
        faction,
        disabled: busy,
        onclick: () => onDispatch(word.value, parseInt(count.value, 10)),
      }),
      popBtn(COMMANDER_CLUE_FORM.cancelLabel, {
        variant: 'secondary',
        onclick: dismiss,
      }),
    ]),
  ], { id: 'commander-clue-sheet', className: 'pop-sheet--commander' });
}

/** Full-screen classified commander board. */
export function renderCommanderConsole(props: CommanderConsoleProps): HTMLElement {
  const { session, snap, xrayTiles, loading, cluePanelOpen, flickerTileIds = [] } = props;
  const flicker = new Set(flickerTileIds);
  const mine = session.visualFaction;

  const root = popScreen('sky', [
    el('header', { class: 'commander-console__header' }, [
      popBtn('← PUBLIC', {
        variant: 'secondary',
        fullWidth: false,
        className: 'pop-btn--compact',
        onclick: props.onBack,
      }),
      el('span', { class: 'commander-console__title' }, [
        'CLASSIFIED X-RAY · T',
        String(snap.turn),
      ]),
    ]),
  ], { class: 'commander-console' });

  const body = el('div', { class: 'commander-console__body' });

  if (!session.isCommander) {
    body.append(
      el('div', { class: 'commander-console__empty' }, [
        el('p', { class: 'pop-body pop-body--center' }, ['COMMANDER SEAT EMPTY']),
        popBtn('TAKE COMMAND', {
          variant: 'primary',
          faction: mine,
          disabled: props.busy,
          fullWidth: false,
          onclick: props.onClaimCommand,
        }),
      ]),
    );
  } else if (loading || !xrayTiles) {
    body.append(
      el('p', { class: 'pop-body pop-body--center', style: 'margin:auto;opacity:0.7' }, [
        'SCANNING BOARD…',
      ]),
    );
  } else {
    const board = popBoard(xrayTiles.map((t) => renderXrayTile(t, flicker.has(t.id))));
    body.append(el('div', { class: 'warroom__stage commander-console__stage' }, [board]));

    if (!cluePanelOpen) {
      body.append(
        el('div', { class: 'commander-console__dock' }, [
          popBtn('ISSUE COMMAND', {
            variant: 'primary',
            faction: mine,
            disabled: props.busy,
            className: 'pop-btn--dock',
            onclick: props.onOpenCluePanel,
          }),
        ]),
      );
    }
  }

  root.append(body);
  return root;
}
