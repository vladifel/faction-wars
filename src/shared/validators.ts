/**
 * Text input formatting checks. Pure, framework-agnostic validators used by the
 * Commander Console (clue entry), board/lore word pipeline, and mod tools.
 */

import { WORD_BLOCKLIST } from './wordBlocklist';

export interface ValidationResult {
  valid: boolean;
  /** Normalized value when valid (e.g. trimmed/uppercased). */
  value?: string;
  error?: string;
}

/** Max lore words stored per subreddit config. */
export const MAX_LORE_LIST_SIZE = 200;

const WORD_PATTERN = /^[A-Za-z][A-Za-z-]{0,23}$/;

export interface SanitizeLoreResult {
  words: string[];
  changed: boolean;
  rejected: number;
}

/**
 * Board + lore words: single token, letters/hyphen, 1–24 chars, not blocklisted.
 * Returns normalized UPPERCASE when valid.
 */
export function validateBoardWord(raw: string): ValidationResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { valid: false, error: 'Word cannot be empty.' };
  if (/\s/.test(trimmed)) return { valid: false, error: 'Word must be a single token.' };
  if (!WORD_PATTERN.test(trimmed)) {
    return { valid: false, error: 'Use letters only (max 24 characters).' };
  }
  const value = trimmed.toUpperCase();
  if (WORD_BLOCKLIST.has(value)) {
    return { valid: false, error: 'Word is not allowed on the board.' };
  }
  return { valid: true, value };
}

/** Filter, dedupe, and cap a lore list. Drops invalid / blocklisted entries. */
export function sanitizeLoreWords(raw: readonly string[]): SanitizeLoreResult {
  const seen = new Set<string>();
  const words: string[] = [];
  let rejected = 0;
  for (const entry of raw) {
    const v = validateBoardWord(entry);
    if (!v.valid || !v.value) {
      rejected++;
      continue;
    }
    if (seen.has(v.value)) continue;
    seen.add(v.value);
    words.push(v.value);
    if (words.length >= MAX_LORE_LIST_SIZE) break;
  }
  const changed =
    rejected > 0 ||
    words.length !== raw.length ||
    words.some((w, i) => w !== raw[i]?.trim().toUpperCase());
  return { words, changed, rejected };
}

/**
 * Codenames-style clue/board conflict: clue must not equal or overlap any tile
 * word (substring either direction).
 */
export function clueConflictsWithBoard(clue: string, boardWords: readonly string[]): boolean {
  const c = clue.trim().toUpperCase();
  if (!c) return false;
  for (const raw of boardWords) {
    const w = raw.trim().toUpperCase();
    if (!w) continue;
    if (c === w || w.includes(c) || c.includes(w)) return true;
  }
  return false;
}

/** Stable fingerprint for a 25-word board (order-independent). */
export function boardFingerprint(words: readonly string[]): string {
  return [...words]
    .map((w) => w.trim().toUpperCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

/**
 * A Codenames clue must be a single word (letters/hyphen), 1-24 chars, and
 * must not be empty. Returns the normalized UPPERCASE clue when valid.
 */
export function validateClueWord(raw: string): ValidationResult {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { valid: false, error: 'Clue cannot be empty.' };
  const base = validateBoardWord(trimmed);
  if (!base.valid && base.error === 'Word must be a single token.') {
    return { valid: false, error: 'Clue must be a single word.' };
  }
  return base;
}

/** Clue count must be an integer in [0, 9]. */
export function validateClueCount(raw: number | string): ValidationResult {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { valid: false, error: 'Count must be a whole number.' };
  }
  if (n < 0 || n > 9) return { valid: false, error: 'Count must be between 0 and 9.' };
  return { valid: true, value: String(n) };
}
