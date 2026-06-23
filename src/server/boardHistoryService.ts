/**
 * Recent board fingerprints per subreddit — avoids back-to-back identical word sets.
 */

import { redis } from '@devvit/web/server';
import { boardFingerprint } from '../shared/validators';
import { keys } from './keys';

export const RECENT_BOARD_HISTORY = 12;
export const MAX_ASSEMBLE_ATTEMPTS = 10;

export async function getRecentBoardFingerprints(subredditId: string): Promise<string[]> {
  const raw = await redis.get(keys.recentBoards(subredditId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function rememberBoardWords(
  subredditId: string,
  words: readonly string[],
): Promise<void> {
  const fp = boardFingerprint(words);
  const list = await getRecentBoardFingerprints(subredditId);
  if (list[0] === fp) return;
  list.unshift(fp);
  if (list.length > RECENT_BOARD_HISTORY) list.length = RECENT_BOARD_HISTORY;
  await redis.set(keys.recentBoards(subredditId), JSON.stringify(list));
}

export function isRecentFingerprint(
  fp: string,
  recent: readonly string[],
): boolean {
  return recent.includes(fp);
}
