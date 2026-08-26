import { describe, expect, it } from 'vitest';
import { storyDiff, validDeadline } from '../src/services/story-state.js';
import type { Story } from '../src/wordpress/types.js';
const story: Story = { id: 1, title: 'Pitch', status: 'pitch', postStatus: 'draft', writer: null, editor: null, deadline: '', section: '', visuals: '', wordpressUrl: 'https://cms/story', publicUrl: '', featuredImageUrl: '', updatedAt: '', discord: { threadId: '', cardMessageId: '', publishMessageId: '', announcementMessageId: '' } };
describe('story state', () => {
  it('detects only relevant state differences', () => expect(storyDiff(story, { ...story, deadline: '2026-08-30' })).toEqual({ title: false, status: false, card: true, publication: false }));
  it('strictly validates ISO deadlines', () => { expect(validDeadline('2026-02-28')).toBe(true); expect(validDeadline('2026-02-30')).toBe(false); expect(validDeadline('8/30/2026')).toBe(false); });
});
