import { describe, it, expect } from 'vitest';
import { buildGlobalWordPool, POOL_MIN_USABLE } from '../src/server/wordPoolService';
import { FALLBACK_WORD_POOL } from '../src/server/globalWords';
import { validateBoardWord } from '../src/shared/validators';

describe('wordPoolService', () => {
  it('buildGlobalWordPool produces enough validated words', async () => {
    const pool = await buildGlobalWordPool();
    expect(pool.length).toBeGreaterThanOrEqual(POOL_MIN_USABLE);
    const seen = new Set<string>();
    for (const word of pool) {
      expect(seen.has(word)).toBe(false);
      seen.add(word);
      expect(validateBoardWord(word).valid, word).toBe(true);
    }
  });

  it('fallback list alone passes validation', () => {
    for (const word of FALLBACK_WORD_POOL) {
      expect(validateBoardWord(word).valid, word).toBe(true);
    }
    expect(FALLBACK_WORD_POOL.length).toBeGreaterThanOrEqual(200);
  });
});
