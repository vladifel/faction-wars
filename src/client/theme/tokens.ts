/**
 * Nano Arcade — visual tokens for synthwave CRT UI.
 * `applyThemeTokens()` mirrors theme + defaults into CSS custom properties.
 */

import type { ThemeTokens, TileRole, VisualFaction } from '../../shared/types';

/** Nano Arcade default palette. */
export const NANO = {
  color: {
    void: '#050014',
    grid: '#1A0033',
    tile: '#111111',
    phosphor: '#00FFFF',
    banana: '#FAED27',
    coconut: '#FF5500',
    neutral: '#555555',
    virus: '#FF0055',
    wire: '#333333',
    magenta: '#FF00FF',
  },
  glow: '0 0 10px',
  space: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  radius: {
    sm: '4px',
    lg: '8px',
    pill: '999px',
  },
  border: {
    thick: '2px',
  },
  font: {
    family: "ui-monospace, 'Courier New', Courier, monospace",
  },
} as const;

/** @deprecated alias — components may still import POP */
export const POP = {
  color: {
    sky: NANO.color.void,
    xray: NANO.color.grid,
    muted: NANO.color.grid,
    pink: NANO.color.banana,
    green: NANO.color.coconut,
    orange: NANO.color.virus,
    grey: NANO.color.neutral,
    white: NANO.color.grid,
    ink: NANO.color.phosphor,
    warn: NANO.color.coconut,
  },
  space: NANO.space,
  radius: NANO.radius,
  border: NANO.border,
  font: NANO.font,
} as const;

function glowShadow(color: string, spread = 10): string {
  return `0 0 ${spread}px ${color}`;
}

function setStructuralTokens(s: CSSStyleDeclaration): void {
  s.setProperty('--pop-space-xs', NANO.space.xs);
  s.setProperty('--pop-space-sm', NANO.space.sm);
  s.setProperty('--pop-space-md', NANO.space.md);
  s.setProperty('--pop-space-lg', NANO.space.lg);
  s.setProperty('--pop-space-xl', NANO.space.xl);
  s.setProperty('--pop-radius-sm', NANO.radius.sm);
  s.setProperty('--pop-radius-lg', NANO.radius.lg);
  s.setProperty('--pop-border-thick', NANO.border.thick);
  s.setProperty('--nano-glow', NANO.glow);
}

function setColorTokens(s: CSSStyleDeclaration, theme: ThemeTokens): void {
  s.setProperty('--nano-void', theme.primaryBg);
  s.setProperty('--nano-grid', theme.secondaryBg);
  s.setProperty('--nano-tile', theme.unflippedTile);
  s.setProperty('--nano-phosphor', theme.textColor);
  s.setProperty('--nano-banana', theme.redColor);
  s.setProperty('--nano-coconut', theme.blueColor);
  s.setProperty('--nano-neutral', theme.neutralColor);
  s.setProperty('--nano-virus', theme.assassinColor);

  s.setProperty('--pop-sky', theme.primaryBg);
  s.setProperty('--pop-white', theme.secondaryBg);
  s.setProperty('--pop-tile', theme.unflippedTile);
  s.setProperty('--pop-ink', theme.textColor);
  s.setProperty('--pop-pink', theme.redColor);
  s.setProperty('--pop-green', theme.blueColor);
  s.setProperty('--pop-grey', theme.neutralColor);
  s.setProperty('--pop-orange', theme.assassinColor);
  s.setProperty('--pop-xray', theme.secondaryBg);
  s.setProperty('--pop-muted', theme.secondaryBg);
  s.setProperty('--pop-warn', theme.assassinColor);

  s.setProperty('--pop-shadow-toy', glowShadow(theme.textColor, 8));
  s.setProperty('--pop-shadow-sheet', `0 -2px 0 ${theme.textColor}, ${glowShadow(theme.textColor, 16)}`);

  s.setProperty('--bg', theme.primaryBg);
  s.setProperty('--panel', theme.secondaryBg);
  s.setProperty('--text', theme.textColor);
  s.setProperty('--ink', theme.textColor);
  s.setProperty('--pink', theme.redColor);
  s.setProperty('--green', theme.blueColor);
  s.setProperty('--red', theme.redColor);
  s.setProperty('--blue', theme.blueColor);
  s.setProperty('--neutral', theme.neutralColor);
  s.setProperty('--assassin', theme.assassinColor);
}

const NANO_DEFAULT_THEME: ThemeTokens = {
  primaryBg: NANO.color.void,
  secondaryBg: NANO.color.grid,
  unflippedTile: NANO.color.tile,
  textColor: NANO.color.phosphor,
  redColor: NANO.color.banana,
  blueColor: NANO.color.coconut,
  neutralColor: NANO.color.neutral,
  assassinColor: NANO.color.virus,
  labels: {
    redTeam: 'Alliance Banana',
    blueTeam: 'Syndicate Coconut',
    redTag: 'Banana',
    blueTag: 'Coconut',
    gameTitle: 'Faction Warfare',
    enterCta: 'Jack In',
  },
};

/** Push defaults before session theme resolves. */
export function injectPopTokens(el: HTMLElement = document.documentElement): void {
  setStructuralTokens(el.style);
  setColorTokens(el.style, NANO_DEFAULT_THEME);
  el.style.setProperty('--nano-font', NANO.font.family);
}

/** Apply subreddit theme into Nano CSS vars (client boot + config refresh). */
export function applyThemeTokens(
  theme: ThemeTokens,
  el: HTMLElement = document.documentElement,
): void {
  setStructuralTokens(el.style);
  setColorTokens(el.style, theme);
  el.style.setProperty('--nano-font', NANO.font.family);
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function factionColor(faction: VisualFaction): string {
  return faction === 'red'
    ? readCssVar('--nano-banana', NANO.color.banana)
    : readCssVar('--nano-coconut', NANO.color.coconut);
}

export function roleColor(role: TileRole | undefined): string {
  switch (role) {
    case 'red':
      return readCssVar('--nano-banana', NANO.color.banana);
    case 'blue':
      return readCssVar('--nano-coconut', NANO.color.coconut);
    case 'neutral':
      return readCssVar('--nano-neutral', NANO.color.neutral);
    case 'assassin':
      return readCssVar('--nano-virus', NANO.color.virus);
    default:
      return readCssVar('--nano-tile', NANO.color.tile);
  }
}
