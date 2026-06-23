/**
 * Realtime broadcast helper.
 *
 * State changes are pushed best-effort over a per-post channel so every open
 * client updates instantly. Delivery is NOT guaranteed - clients still hold the
 * snapshot + lazy-eval safety net, so a dropped message only delays a refresh.
 */

import { realtime } from '@devvit/web/server';
import type { JsonValue } from '@devvit/web/shared';
import type { RealtimeUpdate } from '../shared/api';

/** Channel name for a post's live turn state. */
export function postChannel(postId: string): string {
  return `fw_${postId}`;
}

/** Best-effort broadcast; swallows errors so gameplay never blocks on it. */
export async function broadcastUpdate(
  postId: string,
  update: RealtimeUpdate,
): Promise<void> {
  try {
    await realtime.send(postChannel(postId), update as unknown as JsonValue);
  } catch {
    // Realtime is a convenience layer; snapshot polling is the source of truth.
  }
}
