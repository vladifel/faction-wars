/**
 * User-generated content surfaced in the webview must also exist on Reddit with
 * reportable, attributable posts/comments (Devvit app review requirement).
 */

import { reddit } from '@devvit/web/server';
import type { VisualFaction } from '../shared/types';

export interface PublishedClueComment {
  commentId: string;
  commentPermalink: string;
}

/** Post a commander clue as a comment on the war-room post, attributed to the user. */
export async function publishClueComment(opts: {
  postId: string;
  word: string;
  count: number;
  faction: VisualFaction;
}): Promise<PublishedClueComment> {
  const text =
    `[Faction Warfare] Clue (${opts.faction.toUpperCase()}): ${opts.word} × ${opts.count}`;

  const comment = await reddit.submitComment({
    id: opts.postId as `t3_${string}`,
    text,
    runAs: 'USER',
  });

  return {
    commentId: comment.id,
    commentPermalink: comment.permalink,
  };
}
