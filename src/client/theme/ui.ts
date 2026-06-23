/**
 * Pop UI — composable DOM helpers. All screens use `pop-*` CSS classes + tokens.
 */

import type { VisualFaction } from '../../shared/types';
import { factionColor } from './tokens';
import { el } from '../dom';
import { nanoEmblem } from '../assets/nanoSvg';

export type ScreenBg = 'sky' | 'xray' | 'muted' | 'white';
export type BtnVariant = 'primary' | 'secondary' | 'ghost';

type Attrs = Record<string, unknown>;

function cls(...parts: (string | false | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Full-height screen shell. */
export function popScreen(
  bg: ScreenBg,
  children: (Node | string)[],
  extra: Attrs = {},
): HTMLElement {
  const { class: extraClass, ...rest } = extra;
  return el('div', {
    class: cls('pop-screen', `pop-screen--${bg}`, extraClass as string),
    ...rest,
  }, children);
}

/** Centered content column (gate, tombstone, errors). */
export function popStack(children: (Node | string)[], className = ''): HTMLElement {
  return el('div', { class: cls('pop-stack', className) }, children);
}

/** Chunky bordered panel. */
export function popCard(children: (Node | string)[], className = ''): HTMLElement {
  return el('div', { class: cls('pop-card', className) }, children);
}

/** Arcade button — variant + optional faction tint on primary. */
export function popBtn(
  label: string,
  opts: {
    variant: BtnVariant;
    faction?: VisualFaction;
    disabled?: boolean;
    fullWidth?: boolean;
    className?: string;
    onclick?: () => void;
  },
): HTMLButtonElement {
  const { variant, faction, disabled, fullWidth = true, className, onclick } = opts;
  const variantClass = `pop-btn--${variant}`;
  return el(
    'button',
    {
      type: 'button',
      class: cls(
        'pop-btn',
        variantClass,
        faction === 'red' && variant === 'primary' && 'pop-btn--pink',
        faction === 'blue' && variant === 'primary' && 'pop-btn--green',
        fullWidth && 'pop-btn--block',
        className,
      ),
      disabled,
      onclick,
    },
    [label],
  ) as HTMLButtonElement;
}

/** Score / faction badge in the war room header. */
export function popBadge(
  faction: VisualFaction,
  score: number,
  tag: string,
  active: boolean,
): HTMLElement {
  return el(
    'div',
    {
      class: cls(
        'pop-badge',
        faction === 'red' ? 'pop-badge--pink' : 'pop-badge--green',
        active && 'pop-badge--active',
      ),
    },
    [
      el('span', { class: 'pop-badge__emblem' }, [nanoEmblem(faction, 'pop-badge__emblem-svg')]),
      el('span', { class: 'pop-badge__score' }, [String(score)]),
      el('span', { class: 'pop-badge__tag' }, [tag]),
    ],
  );
}

export function popEyebrow(text: string, className = ''): HTMLElement {
  return el('p', { class: cls('pop-eyebrow', className) }, [text]);
}

export function popTitle(text: string, size: 'lg' | 'xl' = 'lg'): HTMLElement {
  return el('h1', { class: cls('pop-title', size === 'xl' && 'pop-title--xl') }, [text]);
}

export function popHeading(text: string): HTMLElement {
  return el('h2', { class: 'pop-heading' }, [text]);
}

export function popBody(text: string, className = ''): HTMLElement {
  return el('p', { class: cls('pop-body', className) }, [text]);
}

/** Bottom vote / action sheet panel. */
export function popSheet(
  children: (Node | string)[],
  opts: { id?: string; className?: string } = {},
): HTMLElement {
  return el('div', {
    id: opts.id,
    class: cls('pop-sheet', 'pop-sheet--open', opts.className),
  }, children);
}

export function popSheetHandle(onDismiss?: () => void): HTMLElement {
  return el('div', {
    class: cls('pop-sheet__handle', onDismiss && 'pop-sheet__handle--tap'),
    ...(onDismiss
      ? {
          role: 'button',
          tabindex: 0,
          'aria-label': 'Close',
          onclick: onDismiss,
          onkeydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onDismiss();
            }
          },
        }
      : { 'aria-hidden': 'true' }),
  });
}

/** Sheet header back control. */
export function popSheetBack(label: string, onclick: () => void): HTMLButtonElement {
  return el(
    'button',
    { type: 'button', class: 'pop-sheet__back', onclick },
    [label],
  ) as HTMLButtonElement;
}

/** 5×5 fluid board grid. */
export function popBoard(children: (Node | string)[]): HTMLElement {
  return el('div', { class: 'pop-board board' }, children);
}

/** War room top bar row. */
export function popBar(children: (Node | string)[]): HTMLElement {
  return el('header', { class: 'pop-bar warroom__bar' }, children);
}

export function popBarCenter(children: (Node | string)[]): HTMLElement {
  return el('div', { class: 'pop-bar__center' }, children);
}

/** Floating clue ticker. */
export function popClueHud(children: (Node | string)[]): HTMLElement {
  return el('div', { class: 'pop-clue pop-clue--live' }, children);
}

/** Text field styled for commander forms. */
export function popField(attrs: Attrs): HTMLInputElement {
  const { class: extraClass, ...rest } = attrs;
  return el('input', {
    class: cls('pop-field', extraClass as string),
    ...rest,
  }) as HTMLInputElement;
}

/** Small round icon button (commander menu). */
export function popIconBtn(
  label: string,
  opts: { className?: string; faction: VisualFaction; onclick: () => void },
): HTMLButtonElement {
  return el(
    'button',
    {
      type: 'button',
      class: cls('pop-icon-btn', 'bar-cmd', opts.className),
      style: `--pop-accent:${factionColor(opts.faction)}`,
      'aria-label': label,
      onclick: opts.onclick,
    },
    ['⌘'],
  ) as HTMLButtonElement;
}

export function popDivider(): HTMLElement {
  return el('span', { class: 'pop-divider' }, ['|']);
}

/** Score pill on gate (PINK: n | GREEN: n). */
export function popScorePill(
  pinkScore: number,
  greenScore: number,
  pinkLabel: string,
  greenLabel: string,
): HTMLElement {
  return el('div', { class: 'pop-score-pill pop-score-pill--nano' }, [
    el('span', { class: 'pop-score-pill__emblem' }, [nanoEmblem('red', 'pop-score-pill__emblem-svg')]),
    el('span', { class: 'pop-score-pill__pink' }, [`${pinkLabel}: ${pinkScore}`]),
    popDivider(),
    el('span', { class: 'pop-score-pill__green' }, [`${greenLabel}: ${greenScore}`]),
    el('span', { class: 'pop-score-pill__emblem' }, [nanoEmblem('blue', 'pop-score-pill__emblem-svg')]),
  ]);
}

export function popFactionPill(text: string, faction: VisualFaction): HTMLElement {
  return el('div', {
    class: 'pop-faction-pill',
    style: `--pop-accent:${factionColor(faction)}`,
  }, [text]);
}

export { POP, factionColor, roleColor } from './tokens';
