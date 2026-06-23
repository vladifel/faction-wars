import { describe, expect, it, beforeEach } from 'vitest';
import { redis } from './mocks/devvitServer';
import { createAndPersistBoard } from '../src/server/boardService';
import { defaultSubConfig } from '../src/server/migrations';
import { resolveRetryNavigateUrl } from '../src/server/livePostService';
import { keys } from '../src/server/keys';

const SUB = 't5_sub';
const SEASON_A = 's_t3_postA';
const POST_A = 't3_postA';
const POST_B = 't3_postB';

beforeEach(async () => {
  await redis.del(keys.activeSeason(SUB), keys.postContext(POST_A), keys.postContext(POST_B));
});

describe('resolveRetryNavigateUrl', () => {
  it('returns subreddit when no active season', async () => {
    const res = await resolveRetryNavigateUrl({
      subredditId: SUB,
      subredditName: 'testsub',
      currentPostId: POST_A,
    });
    expect(res.target).toBe('subreddit');
    expect(res.navigateTo).toBe('https://reddit.com/r/testsub');
  });

  it('returns live post when active season moved to a new war room', async () => {
    await createAndPersistBoard({
      season: SEASON_A,
      turn: 1,
      postId: POST_A,
      config: defaultSubConfig(SUB),
    });
    await redis.set(keys.activeSeason(SUB), SEASON_A);
    await redis.set(keys.currentTurn(SEASON_A), '1');

    await createAndPersistBoard({
      season: 's_t3_postB',
      turn: 1,
      postId: POST_B,
      config: defaultSubConfig(SUB),
    });
    await redis.set(keys.activeSeason(SUB), 's_t3_postB');
    await redis.set(keys.currentTurn('s_t3_postB'), '1');

    const res = await resolveRetryNavigateUrl({
      subredditId: SUB,
      subredditName: 'testsub',
      currentPostId: POST_A,
    });
    expect(res.target).toBe('live_post');
    expect(res.postId).toBe(POST_B);
    expect(res.navigateTo).toContain(POST_B.replace('t3_', ''));
  });
});
