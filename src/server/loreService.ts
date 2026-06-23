/**
 * Subreddit lore word list — mod-managed, validated on every write.
 */

import type { SubConfig } from '../shared/types';
import { MAX_LORE_LIST_SIZE, sanitizeLoreWords, validateBoardWord } from '../shared/validators';
import { getSubConfig, writeSubConfig } from './config';

export interface LoreMutationResult {
  ok: boolean;
  error?: string;
  lore?: string[];
  removed?: number;
}

/** Normalize lore on read; persist if entries were dropped. */
export async function ensureSanitizedLore(subredditId: string): Promise<SubConfig> {
  return getSubConfig(subredditId);
}

export async function listLoreWords(subredditId: string): Promise<string[]> {
  const config = await ensureSanitizedLore(subredditId);
  return config.words.lore;
}

export async function addLoreWord(subredditId: string, raw: string): Promise<LoreMutationResult> {
  const v = validateBoardWord(raw);
  if (!v.valid) return { ok: false, error: v.error };

  const config = await ensureSanitizedLore(subredditId);
  const lore = [...config.words.lore];
  if (lore.includes(v.value!)) {
    return { ok: false, error: 'Word is already on the lore list.' };
  }
  if (lore.length >= MAX_LORE_LIST_SIZE) {
    return { ok: false, error: `Lore list is full (max ${MAX_LORE_LIST_SIZE}).` };
  }
  lore.push(v.value!);
  await writeSubConfig({ ...config, words: { lore } });
  return { ok: true, lore };
}

export async function removeLoreWord(subredditId: string, raw: string): Promise<LoreMutationResult> {
  const target = raw.trim().toUpperCase();
  if (!target) return { ok: false, error: 'Word cannot be empty.' };

  const config = await ensureSanitizedLore(subredditId);
  const before = config.words.lore.length;
  const lore = config.words.lore.filter((w) => w !== target);
  if (lore.length === before) {
    return { ok: false, error: 'Word was not on the lore list.' };
  }
  await writeSubConfig({ ...config, words: { lore } });
  return { ok: true, lore, removed: before - lore.length };
}

export async function sanitizeLoreList(subredditId: string): Promise<LoreMutationResult> {
  const config = await getSubConfig(subredditId);
  const { words, changed, rejected } = sanitizeLoreWords(config.words.lore);
  if (changed) {
    await writeSubConfig({ ...config, words: { lore: words } });
  }
  return { ok: true, lore: words, removed: rejected };
}
