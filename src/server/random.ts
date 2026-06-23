/**
 * Deterministic-friendly randomness helpers used for board assembly.
 * Pure functions so they are trivially testable.
 */

/** Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(input: readonly T[]): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Sample up to `count` unique items from a pool. */
export function sample<T>(pool: readonly T[], count: number): T[] {
  if (count <= 0) return [];
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

/** Random integer in [min, max]. */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick one random element (or undefined for empty arrays). */
export function pickOne<T>(pool: readonly T[]): T | undefined {
  if (pool.length === 0) return undefined;
  return pool[randInt(0, pool.length - 1)];
}
