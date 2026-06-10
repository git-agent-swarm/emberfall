import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { HUB_TITLE, submitPost } from '../core/post';

export const menu = new Hono();

menu.post('/post-create', async (c) => {
  try {
    const { id } = await submitPost(HUB_TITLE);
    const id36 = id.startsWith('t3_') ? id.slice(3) : id;
    return c.json<UiResponse>(
      {
        navigateTo: `https://www.reddit.com/r/${context.subredditName}/comments/${id36}`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<UiResponse>({ showToast: 'Failed to create post' }, 400);
  }
});
