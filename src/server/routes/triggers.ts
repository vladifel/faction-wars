/**
 * Lifecycle triggers (`/internal/triggers/*`).
 *
 * On first install we seed the subreddit config and create an opening war-room
 * post so moderators land on a live game. Upgrades just re-seed config.
 */

import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { TriggerResponse } from '@devvit/web/shared';
import { getSubConfig } from '../config';
import { createPost } from '../post';
import { refreshGlobalWordPool } from '../wordPoolService';

export const triggers = new Hono();

triggers.post('/lifecycle', async (c) => {
  const subredditId = context.subredditId;
  if (!subredditId) return c.json<TriggerResponse>({}, 200);

  try {
    // Seed (or migrate) config up front so the first render is instant.
    await getSubConfig(subredditId);
    const body = (await c.req.json().catch(() => ({}))) as { type?: string };
    if (body.type === 'AppInstall') {
      void refreshGlobalWordPool().catch((err) =>
        console.warn(`Word pool warm failed: ${err}`),
      );
      await createPost(subredditId);
    }
    return c.json<TriggerResponse>({}, 200);
  } catch (err) {
    console.error(`Lifecycle trigger failed: ${err}`);
    return c.json<TriggerResponse>({}, 200);
  }
});
