/**
 * Moderator gate for lore / config mutations.
 */

import { context, reddit } from '@devvit/web/server';
import { isDevPlaytest } from './devMode';

/** True when the current request user is a subreddit moderator. */
export async function isRequestModerator(): Promise<boolean> {
  if (isDevPlaytest() && context.userId) return true;
  const user = await reddit.getCurrentUser();
  return user?.isModerator ?? false;
}

export async function requireModerator(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!context.userId) return { ok: false, error: 'Not logged in.' };
  if (!(await isRequestModerator())) {
    return { ok: false, error: 'Moderator access only.' };
  }
  return { ok: true };
}
