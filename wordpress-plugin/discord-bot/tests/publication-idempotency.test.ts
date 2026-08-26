import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { StorySyncService } from '../src/services/story-sync.js';
import type { Story } from '../src/wordpress/types.js';

describe('publication reconciliation', () => {
  it('edits recorded publication messages instead of posting duplicates', async () => {
    const threadEdit = vi.fn(); const announcementEdit = vi.fn(); const threadSend = vi.fn(); const announcementSend = vi.fn();
    const thread = { messages: { fetch: vi.fn(async (id: string) => id === 'publish-id' ? { edit: threadEdit } : null) }, send: threadSend };
    const announcements = { messages: { fetch: vi.fn(async (id: string) => id === 'announcement-id' ? { edit: announcementEdit } : null) }, send: announcementSend };
    const wordpress = { linkStory: vi.fn(async (_id: number, discord: unknown) => ({ ...story, discord: { ...story.discord, ...(discord as object) } })) };
    const service = new StorySyncService({ user: { id: 'bot' } } as never, wordpress as never, { publicationAnnouncements: true } as Config);
    (service as unknown as { announcements: unknown }).announcements = announcements;
    await (service as unknown as { reconcilePublication(thread: unknown, story: Story): Promise<Story> }).reconcilePublication(thread, story);
    expect(threadEdit).toHaveBeenCalledOnce(); expect(announcementEdit).toHaveBeenCalledOnce(); expect(threadSend).not.toHaveBeenCalled(); expect(announcementSend).not.toHaveBeenCalled();
  });
});

const story: Story = { id: 7, title: 'Published story', status: 'published', postStatus: 'publish', writer: null, editor: null, deadline: '', section: '', visuals: '', wordpressUrl: 'https://cms/7', publicUrl: 'https://weeklywildcat.com/story', featuredImageUrl: '', updatedAt: '', discord: { threadId: 'thread', cardMessageId: 'card', publishMessageId: 'publish-id', announcementMessageId: 'announcement-id' } };
