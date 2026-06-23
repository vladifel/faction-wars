/**
 * Arcade entry portal — feed hook that screams "PLAY ME!"
 */

import type { ClientSession } from '../../shared/api';
import type { BoardSnapshot, ThemeTokens } from '../../shared/types';
import { factionLabel, factionTag } from '../../shared/theme';
import {
  popBody,
  popBtn,
  popEyebrow,
  popFactionPill,
  popScorePill,
  popScreen,
  popStack,
  popTitle,
} from '../theme/ui';
import { el } from '../dom';
import { nanoEmblem } from '../assets/nanoSvg';

export interface GateViewProps {
  session: ClientSession;
  snap: BoardSnapshot;
  theme: ThemeTokens;
  onEnter: () => void;
}

function renderGateTitle(theme: ThemeTokens): HTMLElement {
  const words = theme.labels.gameTitle.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return el('div', { class: 'pop-title pop-title--split pop-title--arcade pop-title--nano-chroma' }, [
      el('span', { class: 'pop-title__line--lg' }, [words[0]!.toUpperCase()]),
      el('span', { class: 'pop-title__line--sm' }, [words.slice(1).join(' ').toUpperCase()]),
    ]);
  }
  return popTitle((words[0] ?? theme.labels.gameTitle).toUpperCase(), 'xl');
}

/** First-screen arcade cabinet gate. */
export function renderGateView(props: GateViewProps): HTMLElement {
  const { session, snap, theme, onEnter } = props;
  const faction = session.visualFaction;

  return popScreen('sky', [
    popStack([
      popEyebrow('INSERT COIN', 'pop-eyebrow--coin'),
      el('div', { class: 'nano-gate-emblems' }, [
        el('div', { class: 'nano-gate-emblems__icon' }, [nanoEmblem('red')]),
        el('div', { class: 'nano-gate-emblems__icon' }, [nanoEmblem('blue')]),
      ]),
      renderGateTitle(theme),
      popScorePill(
        snap.scores.red,
        snap.scores.blue,
        factionTag(theme, 'red').toUpperCase(),
        factionTag(theme, 'blue').toUpperCase(),
      ),
      popFactionPill(`YOU ARE ${factionLabel(theme, faction).toUpperCase()}`, faction),
      popBody(
        session.loggedIn
          ? 'Vote tiles with your faction. One wrong flip ends it all.'
          : 'Log in to Reddit to enlist and cast your vote.',
        'pop-body--center',
      ),
      popBtn(theme.labels.enterCta.toUpperCase(), {
        variant: 'primary',
        className: 'pop-btn--cta pop-btn--arcade',
        onclick: onEnter,
      }),
      session.trusted
        ? popBody(`${session.factionPopulation} ALLIES DEPLOYED`, 'pop-body--meta')
        : popBody('NEW ACCOUNT — OBSERVE ONLY UNTIL TRUST EARNED', 'pop-body--warn'),
    ]),
  ], { class: 'pop-screen--center pop-screen--arcade-gate' });
}
