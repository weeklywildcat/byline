import { describe, expect, it } from 'vitest';
import type { GuildForumTag } from 'discord.js';
import { mergeWorkflowTag } from '../src/discord/forums.js';
const tags = [{ id: 'news', name: 'News', moderated: false, emoji: null }, { id: 'pitch', name: 'Pitch', moderated: false, emoji: { id: null, name: '💡' } }, { id: 'editing', name: 'Editing', moderated: false, emoji: { id: null, name: '📝' } }] as GuildForumTag[];
describe('managed Forum tags', () => {
  it('preserves unrelated tags and replaces workflow tags', () => expect(mergeWorkflowTag(['news', 'pitch'], tags, 'editing')).toEqual(['news', 'editing']));
  it('leaves exactly one workflow tag', () => {
    const applied = mergeWorkflowTag(['pitch', 'editing'], tags, 'editing');
    expect(applied.filter((id) => ['pitch', 'editing'].includes(id))).toEqual(['editing']);
  });
  it('reports the five-tag limit instead of silently dropping workflow state', () => expect(() => mergeWorkflowTag(['a', 'b', 'c', 'd', 'e'], tags, 'editing')).toThrow(/five unrelated Forum tags/));
});
