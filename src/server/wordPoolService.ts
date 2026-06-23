/**
 * Auto-generated global word pool — zero manual curation.
 *
 * 1. Redis cache (30d TTL) shared app-wide
 * 2. Build: optional Datamuse API seed (free, no key) + random-words fill
 * 3. All entries pass validateBoardWord() + blocklist
 * 4. FALLBACK_WORD_POOL if build fails
 */

import { generate } from 'random-words';
import { redis } from '@devvit/web/server';
import { validateBoardWord } from '../shared/validators';
import { FALLBACK_WORD_POOL } from './globalWords';
import { keys } from './keys';

export const POOL_TARGET_SIZE = 2500;
export const POOL_MIN_USABLE = 120;
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DATAMUSE_TOPICS = [
  'animal',
  'food',
  'plant',
  'place',
  'sport',
  'science',
  'music',
  'tool',
  'vehicle',
  'weather',
] as const;

interface DatamuseHit {
  word?: string;
}

function addValidated(seen: Set<string>, out: string[], raw: string): void {
  const v = validateBoardWord(raw);
  if (!v.valid || !v.value || seen.has(v.value)) return;
  seen.add(v.value);
  out.push(v.value);
}

/** Fetch topic-related nouns from Datamuse (best-effort; needs http.fetch allowlist). */
export async function fetchDatamuseWords(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];

  await Promise.all(
    DATAMUSE_TOPICS.map(async (topic) => {
      try {
        const res = await fetch(
          `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(topic)}&max=400`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!res.ok) return;
        const hits = (await res.json()) as DatamuseHit[];
        for (const hit of hits) {
          if (hit.word) addValidated(seen, out, hit.word);
        }
      } catch {
        /* offline / domain not allowlisted — skip */
      }
    }),
  );

  return out;
}

/** Generate a fresh filtered pool (Datamuse seed + random-words). */
export async function buildGlobalWordPool(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const w of FALLBACK_WORD_POOL) {
    addValidated(seen, out, w);
  }

  for (const w of await fetchDatamuseWords()) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }

  let attempts = 0;
  while (out.length < POOL_TARGET_SIZE && attempts < 400) {
    attempts++;
    const batch = generate({
      exactly: 80,
      minLength: 4,
      maxLength: 12,
    }) as string[];
    for (const raw of batch) {
      addValidated(seen, out, raw);
      if (out.length >= POOL_TARGET_SIZE) break;
    }
  }

  if (out.length < POOL_MIN_USABLE) {
    return [...FALLBACK_WORD_POOL];
  }
  return out;
}

/** Read cached pool or build + persist. */
export async function getGlobalWordPool(): Promise<string[]> {
  const cached = await redis.get(keys.globalWordPool());
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (Array.isArray(parsed) && parsed.length >= POOL_MIN_USABLE) {
        return parsed.filter((w): w is string => typeof w === 'string');
      }
    } catch {
      /* rebuild below */
    }
  }
  return refreshGlobalWordPool();
}

/** Force rebuild and cache. Returns pool size. */
export async function refreshGlobalWordPool(): Promise<string[]> {
  const pool = await buildGlobalWordPool();
  await redis.set(keys.globalWordPool(), JSON.stringify(pool));
  await redis.expire(keys.globalWordPool(), CACHE_TTL_SECONDS);
  return pool;
}
