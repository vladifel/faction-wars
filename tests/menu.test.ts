import { describe, it, expect, beforeEach } from 'vitest';
import { __test, context } from './mocks/devvitServer';
import { menu } from '../src/server/routes/menu';
import type { UiResponse } from '@devvit/web/shared';

async function postMenu<T>(path: string): Promise<{ status: number; body: T }> {
  const res = await menu.request(path, { method: 'POST' });
  return { status: res.status, body: (await res.json()) as T };
}

beforeEach(() => {
  __test.reset();
  context.subredditId = 't5_sub';
  context.subredditName = 'factionwarfare_dev';
  context.userId = undefined;
});

describe('menu routes', () => {
  it('blocks post-create for non-moderators', async () => {
    context.userId = 't2_user';
    const res = await postMenu<UiResponse>('/post-create');
    expect(res.status).toBe(403);
  });

  it('blocks lore-sanitize for non-moderators', async () => {
    context.userId = 't2_user';
    const res = await postMenu<UiResponse>('/lore-sanitize');
    expect(res.status).toBe(403);
  });

  it('allows lore-sanitize for moderators', async () => {
    context.userId = 't2_mod1';
    const res = await postMenu<UiResponse>('/lore-sanitize');
    expect(res.status).toBe(200);
  });
});
