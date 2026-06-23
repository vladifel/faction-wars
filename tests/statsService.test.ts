import { describe, expect, it, beforeEach } from 'vitest';
import { redis } from './mocks/devvitServer';
import { recordSeasonResults } from '../src/server/statsService';
import { keys } from '../src/server/keys';
import type { GlobalStats } from '../src/shared/types';

const SEASON = 's_stats';

async function readGlobalStats(userId: string): Promise<GlobalStats> {
  const raw = await redis.get(keys.globalStats(userId));
  return JSON.parse(raw!) as GlobalStats;
}

beforeEach(async () => {
  await redis.del(
    keys.seasonResultsRecorded(SEASON),
    keys.factions(SEASON),
    keys.globalStats('t2_a'),
    keys.globalStats('t2_b'),
  );
});

describe('recordSeasonResults', () => {
  it('is idempotent for the same season', async () => {
    await redis.hSet(keys.factions(SEASON), { t2_a: 'red', t2_b: 'blue' });
    await recordSeasonResults({ season: SEASON, winner: 'red', endReason: 'tiles' });
    await recordSeasonResults({ season: SEASON, winner: 'red', endReason: 'tiles' });
    expect((await readGlobalStats('t2_a')).wins).toBe(1);
    expect((await readGlobalStats('t2_b')).losses).toBe(1);
  });

  it('records losses for both factions on stalemate', async () => {
    await redis.hSet(keys.factions(SEASON), { t2_a: 'red', t2_b: 'blue' });
    await recordSeasonResults({ season: SEASON, endReason: 'stalemate' });
    expect((await readGlobalStats('t2_a')).losses).toBe(1);
    expect((await readGlobalStats('t2_b')).losses).toBe(1);
    expect((await readGlobalStats('t2_a')).wins).toBe(0);
  });
});
