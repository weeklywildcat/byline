import { ButtonStyle, ChannelType } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import {
  CommandHandler,
  CREATE_WORDPRESS_ARTICLE_BUTTON_ID,
  missingWordPressStoryReply,
} from '../src/commands/handler.js';
import type { StorySyncService } from '../src/services/story-sync.js';
import { WordPressClient, WordPressError } from '../src/wordpress/client.js';
import type { Story } from '../src/wordpress/types.js';

const config = {
  guildId: '11111111111111111',
  storyboardChannelId: '22222222222222222',
  publicationShortName: 'Byline',
  contextMenuCommandName: 'Create Byline story',
} as Config;

const story: Story = {
  id: 42,
  title: 'Test story',
  status: 'pitch',
  postStatus: 'draft',
  writer: null,
  editor: null,
  deadline: '',
  section: '',
  visuals: '',
  wordpressUrl: 'https://example.test/wp-admin/post.php?post=42&action=edit',
  publicUrl: '',
  featuredImageUrl: '',
  updatedAt: '2026-08-28T00:00:00Z',
  discord: {
    threadId: '33333333333333333',
    cardMessageId: '',
    publishMessageId: '',
    announcementMessageId: '',
  },
};

function storyboardThread() {
  return {
    id: '33333333333333333',
    name: 'Test pitch',
    parentId: config.storyboardChannelId,
    parent: { type: ChannelType.GuildForum },
    isThread: () => true,
  };
}

function chatInteraction() {
  const interaction: any = {
    commandName: 'story',
    options: { getSubcommand: () => 'assign' },
    channel: storyboardThread(),
    user: { id: '44444444444444444' },
    guildId: config.guildId,
    deferred: false,
    replied: false,
    isChatInputCommand: () => true,
    isMessageContextMenuCommand: () => false,
    isButton: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
  };
  interaction.deferReply = vi.fn(async () => { interaction.deferred = true; });
  interaction.editReply = vi.fn(async (payload: unknown) => payload);
  interaction.reply = vi.fn(async (payload: unknown) => payload);
  return interaction;
}

describe('missing WordPress story handling', () => {
  it('builds an actionable missing-article prompt', () => {
    const reply = missingWordPressStoryReply();
    const row = reply.components[0]!.toJSON();
    expect(reply.content).toBe('This does not exist as a WordPress article yet.');
    expect(row.components[0]).toMatchObject({
      custom_id: CREATE_WORDPRESS_ARTICLE_BUTTON_ID,
      label: 'Create WordPress article',
      style: ButtonStyle.Primary,
    });
  });

  it('turns the legacy ambiguous 403 into the create prompt only when the thread is actually unlinked', async () => {
    const interaction = chatInteraction();
    const storyByThread = vi.fn()
      .mockRejectedValueOnce(new WordPressError('Your Byline account cannot view this story.', 403, 'wwh_forbidden'))
      .mockRejectedValueOnce(new WordPressError('This thread is not linked to a WordPress story.', 404, 'wwh_story_not_found'));
    const wordpress = { storyByThread } as unknown as WordPressClient;
    const handler = new CommandHandler(wordpress, {} as StorySyncService, config);

    await handler.handle(interaction);

    expect(storyByThread).toHaveBeenNthCalledWith(1, story.discord.threadId, interaction.user.id);
    expect(storyByThread).toHaveBeenNthCalledWith(2, story.discord.threadId);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply.mock.calls[0]![0].content).toBe('This does not exist as a WordPress article yet.');
  });

  it('preserves a real WordPress permission denial', async () => {
    const interaction = chatInteraction();
    const storyByThread = vi.fn()
      .mockRejectedValueOnce(new WordPressError('Your Byline account cannot view this story.', 403, 'wwh_forbidden'))
      .mockResolvedValueOnce(story);
    const wordpress = { storyByThread } as unknown as WordPressClient;
    const handler = new CommandHandler(wordpress, {} as StorySyncService, config);

    await handler.handle(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    expect(interaction.editReply.mock.calls[0]![0]).toMatchObject({
      content: 'Your Byline account cannot view this story.',
      components: [],
    });
  });

  it('creates and links the WordPress article when the button is clicked', async () => {
    const interaction: any = {
      customId: CREATE_WORDPRESS_ARTICLE_BUTTON_ID,
      channel: storyboardThread(),
      user: { id: '44444444444444444' },
      guildId: config.guildId,
      deferred: false,
      replied: false,
      isChatInputCommand: () => false,
      isMessageContextMenuCommand: () => false,
      isButton: () => true,
      isModalSubmit: () => false,
      isRepliable: () => true,
    };
    interaction.deferUpdate = vi.fn(async () => { interaction.deferred = true; });
    interaction.editReply = vi.fn(async (payload: unknown) => payload);
    interaction.reply = vi.fn(async (payload: unknown) => payload);

    const createStory = vi.fn().mockResolvedValue({ created: true, story });
    const wordpress = { createStory } as unknown as WordPressClient;
    const sync = { sync: vi.fn().mockResolvedValue(story) } as unknown as StorySyncService;
    const handler = new CommandHandler(wordpress, sync, config);

    await handler.handle(interaction);

    expect(createStory).toHaveBeenCalledWith(story.discord.threadId, 'Test pitch', interaction.user.id, `promote-${story.discord.threadId}`);
    expect(interaction.deferUpdate).toHaveBeenCalledOnce();
    expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining('Created WordPress story **Test story**.'),
      components: [],
    }));
  });
});
