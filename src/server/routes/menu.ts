/**
 * Subreddit menu actions (`/internal/menu/*`).
 */

import { Hono } from 'hono';
import { context } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';
import { createPost } from '../post';
import { redactUser } from '../statsService';
import { sanitizeLoreList } from '../loreService';
import { requireModerator } from '../modAuth';

export const menu = new Hono();

/** Moderator: launch a fresh Faction Warfare war-room post. */
menu.post('/post-create', async (c) => {
  const gate = await requireModerator();
  if (!gate.ok) {
    return c.json<UiResponse>(
      { showToast: gate.error === 'Not logged in.' ? 'You must be logged in.' : 'Moderator access only.' },
      gate.error === 'Not logged in.' ? 401 : 403,
    );
  }
  const subredditId = context.subredditId;
  if (!subredditId) {
    return c.json<UiResponse>({ showToast: 'No subreddit context.' }, 400);
  }
  try {
    const post = await createPost(subredditId);
    return c.json<UiResponse>(
      { navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}` },
      200,
    );
  } catch (err) {
    console.error(`Failed to create post: ${err}`);
    return c.json<UiResponse>({ showToast: 'Failed to create the war room.' }, 400);
  }
});

/** Moderator: drop invalid / blocklisted lore words from config. */
menu.post('/lore-sanitize', async (c) => {
  const gate = await requireModerator();
  if (!gate.ok) {
    return c.json<UiResponse>(
      { showToast: gate.error === 'Not logged in.' ? 'You must be logged in.' : 'Moderator access only.' },
      gate.error === 'Not logged in.' ? 401 : 403,
    );
  }
  const subredditId = context.subredditId;
  if (!subredditId) {
    return c.json<UiResponse>({ showToast: 'No subreddit context.' }, 400);
  }
  try {
    const res = await sanitizeLoreList(subredditId);
    const n = res.removed ?? 0;
    return c.json<UiResponse>(
      {
        showToast: {
          text:
            n > 0
              ? `Removed ${n} invalid lore word(s). ${res.lore?.length ?? 0} remain.`
              : `Lore list clean (${res.lore?.length ?? 0} words).`,
          appearance: 'success',
        },
      },
      200,
    );
  } catch (err) {
    console.error(`Lore sanitize failed: ${err}`);
    return c.json<UiResponse>({ showToast: 'Could not sanitize lore words.' }, 400);
  }
});

/** User: GDPR scrub of personal stats. */
menu.post('/delete-data', async (c) => {
  const userId = context.userId;
  if (!userId) {
    return c.json<UiResponse>({ showToast: 'You must be logged in.' }, 401);
  }
  try {
    await redactUser(userId);
    return c.json<UiResponse>(
      { showToast: { text: 'Your Faction Warfare data was erased.', appearance: 'success' } },
      200,
    );
  } catch (err) {
    console.error(`Failed to redact user: ${err}`);
    return c.json<UiResponse>({ showToast: 'Could not erase data right now.' }, 400);
  }
});
