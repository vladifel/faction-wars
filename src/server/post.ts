/**
 * Post creation + next-turn spawning (Reddit API concerns isolated here).
 */

import { reddit } from '@devvit/web/server';
import { resolveThemeTokens } from '../shared/theme';
import { getSubConfig } from './config';

/** Create a brand-new Faction Warfare war-room post in the current subreddit. */
export async function createPost(subredditId: string): Promise<{ id: string }> {
  const config = await getSubConfig(subredditId);
  const theme = resolveThemeTokens(config);
  const post = await reddit.submitCustomPost({
    title: `${theme.labels.gameTitle} - War Room`,
    textFallback: {
      text: 'Open this post in the Reddit app to join the battle.',
    },
  });
  return { id: post.id };
}

/**
 * Spawn the post that hosts the next turn frame. Used as the `spawnNextPost`
 * callback by the turn resolver so each turn lives in its own post (the prior
 * post becomes a tombstone that redirects forward).
 */
export async function spawnNextPost(args: {
  season: string;
  nextTurn: number;
  prevPostId: string;
  subredditId: string;
}): Promise<string> {
  const config = await getSubConfig(args.subredditId);
  const theme = resolveThemeTokens(config);
  const post = await reddit.submitCustomPost({
    title: `${theme.labels.gameTitle} - Turn ${args.nextTurn}`,
    textFallback: {
      text: 'Open this post in the Reddit app to join the battle.',
    },
  });
  return post.id;
}
