/**
 * Theme token engine (shared client + server).
 *
 * Components never read raw config colors directly - they call
 * `resolveThemeTokens(subConfig)` so branding stays decoupled from layout and a
 * missing/partial config degrades to safe defaults.
 */

import type { SubConfig, ThemeLabels, ThemeTokens, TileRole, VisualFaction } from './types';

/** Default "Nano Arcade" palette — synthwave CRT + cyber-factions. */
export function defaultTheme(): ThemeTokens {
  return {
    primaryBg: '#050014',
    secondaryBg: '#1A0033',
    unflippedTile: '#111111',
    textColor: '#00FFFF',
    redColor: '#FAED27',
    blueColor: '#FF5500',
    neutralColor: '#555555',
    assassinColor: '#FF0055',
    labels: {
      redTeam: 'Alliance Banana',
      blueTeam: 'Syndicate Coconut',
      redTag: 'Banana',
      blueTag: 'Coconut',
      gameTitle: 'Faction Warfare',
      enterCta: 'Jack In',
    },
  };
}

const LEGACY_RED = /\bred\b/i;
const LEGACY_BLUE = /\bblue\b/i;
const LEGACY_PINK = /\bpink\b/i;
const LEGACY_GREEN = /\bgreen\b/i;

/** Pre-Nano palettes — persisted configs must not keep these. */
const LEGACY_PRIMARY_BGS = new Set([
  '#1a1a2e',
  '#1a1a1b',
  '#0f0f0f',
  '#121212',
  '#38b6ff', // Arcade Pop sky
]);
const LEGACY_SECONDARY_BGS = new Set(['#16213e', '#333333', '#272729']);

function normalizeHex(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  let h = hex.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  return h;
}

/** True when config still carries a superseded palette (dark Reddit or Arcade Pop). */
export function isLegacyThemePalette(theme: Partial<ThemeTokens>): boolean {
  const primary = normalizeHex(theme.primaryBg);
  if (primary && LEGACY_PRIMARY_BGS.has(primary)) return true;

  const secondary = normalizeHex(theme.secondaryBg);
  const red = normalizeHex(theme.redColor);
  const blue = normalizeHex(theme.blueColor);
  if (
    secondary &&
    LEGACY_SECONDARY_BGS.has(secondary) &&
    red &&
    ['#ff0000', '#c84b4b', '#ff4500'].includes(red) &&
    blue &&
    ['#0000ff', '#4b7bc8'].includes(blue)
  ) {
    return true;
  }
  return false;
}

function normalizeThemeColors(
  theme: Partial<ThemeTokens>,
  fallback: ThemeTokens,
): Omit<ThemeTokens, 'labels'> {
  if (isLegacyThemePalette(theme)) {
    return {
      primaryBg: fallback.primaryBg,
      secondaryBg: fallback.secondaryBg,
      unflippedTile: fallback.unflippedTile,
      textColor: fallback.textColor,
      redColor: fallback.redColor,
      blueColor: fallback.blueColor,
      neutralColor: fallback.neutralColor,
      assassinColor: fallback.assassinColor,
    };
  }
  return {
    primaryBg: theme.primaryBg || fallback.primaryBg,
    secondaryBg: theme.secondaryBg || fallback.secondaryBg,
    unflippedTile: theme.unflippedTile || fallback.unflippedTile,
    textColor: theme.textColor || fallback.textColor,
    redColor: theme.redColor || fallback.redColor,
    blueColor: theme.blueColor || fallback.blueColor,
    neutralColor: theme.neutralColor || fallback.neutralColor,
    assassinColor: theme.assassinColor || fallback.assassinColor,
  };
}

/** Replace stale faction copy with Nano Arcade defaults. */
function normalizeThemeLabels(
  labels: Partial<ThemeLabels> | undefined,
  fallback: ThemeLabels,
): ThemeLabels {
  const pick = (value: string | undefined, legacy: RegExp[], fb: string) => {
    if (!value) return fb;
    for (const re of legacy) {
      if (re.test(value)) return fb;
    }
    return value;
  };

  return {
    redTeam: pick(labels?.redTeam, [LEGACY_RED, LEGACY_PINK], fallback.redTeam),
    blueTeam: pick(labels?.blueTeam, [LEGACY_BLUE, LEGACY_GREEN], fallback.blueTeam),
    redTag: pick(labels?.redTag, [LEGACY_RED, LEGACY_PINK], fallback.redTag),
    blueTag: pick(labels?.blueTag, [LEGACY_BLUE, LEGACY_GREEN], fallback.blueTag),
    gameTitle: labels?.gameTitle || fallback.gameTitle,
    enterCta: labels?.enterCta || fallback.enterCta,
  };
}

/** Resolve a complete, defaulted theme token set from (possibly partial) config. */
export function resolveThemeTokens(subConfig?: Partial<SubConfig> | null): ThemeTokens {
  const fallback = defaultTheme();
  const theme = subConfig?.theme;
  if (!theme) return fallback;
  const labels = normalizeThemeLabels(theme.labels, fallback.labels);
  return {
    ...normalizeThemeColors(theme, fallback),
    labels,
  };
}

// ---------------------------------------------------------------------------
// Color compositing helpers.
// ---------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = parseInt(h.slice(0, 6) || '000000', 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Linear blend of two hex colors: t=0 returns `base`, t=1 returns `over`. */
export function blendColors(base: string, over: string, t: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(over);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex({
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  });
}

/** Darken a color toward black (used to fake the tile's drop shadow). */
export function darken(hex: string, amount = 0.5): string {
  return blendColors(hex, '#000000', amount);
}

/** Lighten a color toward white. */
export function lighten(hex: string, amount = 0.2): string {
  return blendColors(hex, '#FFFFFF', amount);
}

/**
 * Heatmap face color for an un-flipped tile: the resting face tinted toward the
 * active faction's color, with intensity rising as votes accumulate.
 */
export function heatmapFace(theme: ThemeTokens, activeColor: string, votes: number): string {
  if (votes <= 0) return theme.unflippedTile;
  const intensity = Math.min(0.55, 0.15 + votes * 0.04);
  return blendColors(theme.unflippedTile, activeColor, intensity);
}

/** Background color for a tile given its (revealed) role, else the base color. */
export function colorForRole(
  theme: ThemeTokens,
  role: TileRole | undefined,
  baseBg: string,
): string {
  switch (role) {
    case 'red':
      return theme.redColor;
    case 'blue':
      return theme.blueColor;
    case 'neutral':
      return theme.neutralColor;
    case 'assassin':
      return theme.assassinColor;
    default:
      return baseBg;
  }
}

/** The themed display label for a faction. */
export function factionLabel(theme: ThemeTokens, faction: VisualFaction): string {
  return faction === 'red' ? theme.labels.redTeam : theme.labels.blueTeam;
}

/** Short HUD tag (Banana / Coconut). */
export function factionTag(theme: ThemeTokens, faction: VisualFaction): string {
  return faction === 'red' ? theme.labels.redTag : theme.labels.blueTag;
}

/** The brand color for a faction. */
export function factionColor(theme: ThemeTokens, faction: VisualFaction): string {
  return faction === 'red' ? theme.redColor : theme.blueColor;
}
