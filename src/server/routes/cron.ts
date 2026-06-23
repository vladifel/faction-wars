/**
 * Scheduled tasks (`/internal/cron/*`).
 *
 * The turn-tick is a safety net: lazy evaluation already advances turns on
 * client contact, but this guarantees forward motion even when no one is
 * viewing the live post.
 */

import { Hono } from 'hono';
import { context, redis } from '@devvit/web/server';
import { getSubConfig } from '../config';
import { keys } from '../keys';
import { spawnNextPost as spawnNextPostImpl } from '../post';
import { ensureTurnFresh } from '../turnService';
import { refreshGlobalWordPool } from '../wordPoolService';

export const cron = new Hono();

cron.post('/turn-tick', async (c) => {
  const subredditId = context.subredditId;
  if (!subredditId) return c.json({}, 200);

  try {
    const season = await redis.get(keys.activeSeason(subredditId));
    if (!season) return c.json({}, 200);

    const turnStr = await redis.get(keys.currentTurn(season));
    const turn = parseInt(turnStr ?? '1', 10);
    const config = await getSubConfig(subredditId);

    await ensureTurnFresh({
      season,
      turn,
      config,
      spawnNextPost: (a) => spawnNextPostImpl({ ...a, subredditId }),
    });
  } catch (err) {
    console.error(`turn-tick failed: ${err}`);
  }
  return c.json({}, 200);
});

/** Weekly rebuild of the shared global word pool cache. */
cron.post('/word-pool-refresh', async (c) => {
  try {
    await refreshGlobalWordPool();
  } catch (err) {
    console.error(`word-pool-refresh failed: ${err}`);
  }
  return c.json({}, 200);
});
