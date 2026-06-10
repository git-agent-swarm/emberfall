import { reddit } from '@devvit/web/server';

export const HUB_TITLE = '🔥 EMBERFALL — outrun the dark. How far can you climb?';

export const submitPost = async (title: string): Promise<{ id: string }> => {
  const post = await reddit.submitCustomPost({ title });
  return { id: post.id };
};
