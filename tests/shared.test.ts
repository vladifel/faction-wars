import { describe, it, expect } from 'vitest';
import {
  defaultTheme,
  resolveThemeTokens,
  blendColors,
  darken,
  lighten,
  heatmapFace,
  colorForRole,
  factionLabel,
  factionTag,
  factionColor,
  isLegacyThemePalette,
} from '../src/shared/theme';
import { truncate, formatRemaining, titleCase } from '../src/shared/strings';
import { validateClueWord, validateClueCount, validateBoardWord, sanitizeLoreWords, clueConflictsWithBoard, boardFingerprint } from '../src/shared/validators';
import { parseAndMigrate, migrate, defaultSubConfig } from '../src/server/migrations';
import { SCHEMA_VERSION, type SubConfig } from '../src/shared/types';

describe('theme', () => {
  const theme = defaultTheme();

  it('falls back to defaults when config is null/partial', () => {
    expect(resolveThemeTokens(null)).toEqual(theme);
    const partial = resolveThemeTokens({ theme: { redColor: '#abcdef' } } as Partial<SubConfig>);
    expect(partial.redColor).toBe('#abcdef');
    expect(partial.blueColor).toBe(theme.blueColor); // untouched -> default
  });

  it('blendColors interpolates endpoints', () => {
    expect(blendColors('#000000', '#ffffff', 0)).toBe('#000000');
    expect(blendColors('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(blendColors('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('darken/lighten move toward black/white', () => {
    expect(darken('#808080', 1)).toBe('#000000');
    expect(lighten('#808080', 1)).toBe('#ffffff');
  });

  it('heatmapFace stays neutral at 0 votes and intensifies, capped', () => {
    expect(heatmapFace(theme, theme.blueColor, 0)).toBe(theme.unflippedTile);
    const one = heatmapFace(theme, theme.blueColor, 1);
    const many = heatmapFace(theme, theme.blueColor, 50);
    const capped = heatmapFace(theme, theme.blueColor, 1000);
    expect(one).not.toBe(theme.unflippedTile);
    expect(many).toBe(capped); // intensity clamps at 0.55
  });

  it('colorForRole / faction helpers map correctly', () => {
    expect(colorForRole(theme, 'red', '#x')).toBe(theme.redColor);
    expect(colorForRole(theme, 'assassin', '#x')).toBe(theme.assassinColor);
    expect(colorForRole(theme, undefined, '#fallback')).toBe('#fallback');
    expect(factionLabel(theme, 'blue')).toBe(theme.labels.blueTeam);
    expect(factionTag(theme, 'red')).toBe('Banana');
    expect(factionTag(theme, 'blue')).toBe('Coconut');
    expect(factionColor(theme, 'red')).toBe(theme.redColor);
  });

  it('resolveThemeTokens upgrades legacy Red/Blue labels to Banana/Coconut', () => {
    const legacy = resolveThemeTokens({
      theme: {
        labels: {
          redTeam: 'Red Faction',
          blueTeam: 'Blue Faction',
          redTag: 'Red',
          blueTag: 'Blue',
          gameTitle: 'FW',
          enterCta: 'Go',
        },
      },
    } as Partial<SubConfig>);
    expect(legacy.labels.redTeam).toBe('Alliance Banana');
    expect(legacy.labels.blueTeam).toBe('Syndicate Coconut');
    expect(legacy.labels.redTag).toBe('Banana');
    expect(legacy.labels.blueTag).toBe('Coconut');
  });

  it('resolveThemeTokens replaces persisted legacy palettes with Nano Arcade', () => {
    const legacy = resolveThemeTokens({
      theme: {
        primaryBg: '#1A1A1B',
        secondaryBg: '#333333',
        unflippedTile: '#272729',
        textColor: '#D7DADC',
        redColor: '#FF4500',
        blueColor: '#4b7bc8',
        neutralColor: '#6b6b6b',
        assassinColor: '#0d0d0d',
      },
    } as Partial<SubConfig>);
    expect(isLegacyThemePalette({ primaryBg: '#1A1A1B' })).toBe(true);
    expect(legacy.primaryBg).toBe(theme.primaryBg);
    expect(legacy.redColor).toBe(theme.redColor);
    expect(legacy.blueColor).toBe(theme.blueColor);
  });
});

describe('strings', () => {
  it('truncate adds ellipsis only when over length', () => {
    expect(truncate('hi', 5)).toBe('hi');
    expect(truncate('hello world', 5)).toBe('hell\u2026');
  });

  it('formatRemaining buckets h/m/s and handles expiry', () => {
    const now = 1_000_000;
    expect(formatRemaining(now, now)).toBe('resolving...');
    expect(formatRemaining(now - 1, now)).toBe('resolving...');
    expect(formatRemaining(now + 2 * 3600_000 + 5 * 60_000, now)).toBe('2h 5m left');
    expect(formatRemaining(now + 5 * 60_000 + 3000, now)).toBe('5m 3s left');
    expect(formatRemaining(now + 9000, now)).toBe('9s left');
  });

  it('titleCase normalizes a token', () => {
    expect(titleCase('rED')).toBe('Red');
    expect(titleCase('')).toBe('');
  });
});

describe('validators', () => {
  it('accepts a clean single-word clue and uppercases it', () => {
    expect(validateClueWord(' ocean ')).toEqual({ valid: true, value: 'OCEAN' });
    expect(validateClueWord('well-known')).toEqual({ valid: true, value: 'WELL-KNOWN' });
  });

  it('rejects empty / multi-word / non-letter / too-long clues', () => {
    expect(validateClueWord('').valid).toBe(false);
    expect(validateClueWord('two words').valid).toBe(false);
    expect(validateClueWord('a1b').valid).toBe(false);
    expect(validateClueWord('x'.repeat(25)).valid).toBe(false);
  });

  it('clue count must be an integer in [0,9]', () => {
    expect(validateClueCount(0)).toEqual({ valid: true, value: '0' });
    expect(validateClueCount('3')).toEqual({ valid: true, value: '3' });
    expect(validateClueCount(10).valid).toBe(false);
    expect(validateClueCount(-1).valid).toBe(false);
    expect(validateClueCount(2.5).valid).toBe(false);
    expect(validateClueCount('abc').valid).toBe(false);
  });

  it('validateBoardWord rejects blocklisted and malformed tokens', () => {
    expect(validateBoardWord('SHIT').valid).toBe(false);
    expect(validateBoardWord('two words').valid).toBe(false);
    expect(validateBoardWord('ocean').valid).toBe(true);
    expect(validateBoardWord('ocean').value).toBe('OCEAN');
  });

  it('sanitizeLoreWords drops bad entries and dedupes', () => {
    const res = sanitizeLoreWords(['OCEAN', 'ocean', 'SHIT', 'VALID']);
    expect(res.words).toEqual(['OCEAN', 'VALID']);
    expect(res.rejected).toBe(1);
    expect(res.changed).toBe(true);
  });

  it('clueConflictsWithBoard catches equal and substring overlap', () => {
    expect(clueConflictsWithBoard('OCEAN', ['OCEAN', 'TIGER'])).toBe(true);
    expect(clueConflictsWithBoard('SEA', ['SEAL'])).toBe(true);
    expect(clueConflictsWithBoard('TIGER', ['SEA', 'LION'])).toBe(false);
  });

  it('boardFingerprint is order-independent', () => {
    expect(boardFingerprint(['B', 'A'])).toBe(boardFingerprint(['A', 'B']));
  });
});

describe('migrations', () => {
  it('returns null for missing payloads', () => {
    expect(parseAndMigrate(null)).toBeNull();
    expect(parseAndMigrate(undefined)).toBeNull();
  });

  it('upgrades a version-0 object to current and flags changed', () => {
    const res = parseAndMigrate<{ schema_version?: number }>(JSON.stringify({ foo: 1 }));
    expect(res).not.toBeNull();
    expect(res!.value.schema_version).toBe(SCHEMA_VERSION);
    expect(res!.changed).toBe(true);
  });

  it('leaves current-version objects unchanged', () => {
    const cfg = defaultSubConfig('t5_x');
    const res = migrate(cfg);
    expect(res.changed).toBe(false);
    expect(res.value).toEqual(cfg);
  });

  it('defaultSubConfig has sane pacing/trust defaults', () => {
    const cfg = defaultSubConfig('t5_x');
    expect(cfg.pacing.vetoThreshold).toBeGreaterThan(0);
    expect(cfg.trust.minAccountAgeDays).toBeGreaterThan(0);
    expect(cfg.words.lore).toEqual([]);
  });

  it('migrates v2 dark palette config to Nano Arcade colors', () => {
    const legacy = {
      schema_version: 2,
      subredditId: 't5_test',
      theme: {
        primaryBg: '#1A1A1B',
        secondaryBg: '#333333',
        unflippedTile: '#272729',
        textColor: '#D7DADC',
        redColor: '#FF4500',
        blueColor: '#4b7bc8',
        neutralColor: '#6b6b6b',
        assassinColor: '#0d0d0d',
        labels: defaultTheme().labels,
      },
      pacing: defaultSubConfig('t5_test').pacing,
      words: { lore: [] },
      trust: defaultSubConfig('t5_test').trust,
    } satisfies SubConfig;
    const res = migrate(legacy);
    expect(res.changed).toBe(true);
    expect(res.value.schema_version).toBe(SCHEMA_VERSION);
    expect(res.value.theme.primaryBg).toBe('#050014');
    expect(res.value.theme.redColor).toBe('#FAED27');
  });
});
