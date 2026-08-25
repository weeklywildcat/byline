import { ChannelType, ForumChannel, PermissionFlagsBits, TextChannel, type Client, type Message, type ThreadChannel } from 'discord.js';
import type { Config } from '../config.js';
import { ensureWorkflowTags, mergeWorkflowTag } from '../discord/forums.js';
import { NO_MENTIONS, roleMention, storyCard } from '../discord/messages.js';
import { WordPressClient } from '../wordpress/client.js';
import type { Story } from '../wordpress/types.js';

export interface HealthState { discordConnected: boolean; guildFound: boolean; storyboardFound: boolean; announcementsFound: boolean; wordpressReachable: boolean; managedTagsAvailable: boolean; missingPermissions: string[]; lastSuccessfulReconciliation: string | null; message: string }

export class StorySyncService {
  readonly health: HealthState = { discordConnected: false, guildFound: false, storyboardFound: false, announcementsFound: false, wordpressReachable: false, managedTagsAvailable: false, missingPermissions: [], lastSuccessfulReconciliation: null, message: 'Starting' };
  private forum?: ForumChannel;
  private announcements?: TextChannel;
  constructor(readonly client: Client, readonly wordpress: WordPressClient, readonly config: Config) {}

  async initialize(): Promise<void> {
    this.health.discordConnected = this.client.isReady();
    const guild = await this.client.guilds.fetch(this.config.guildId);
    this.health.guildFound = true;
    const forum = await guild.channels.fetch(this.config.storyboardChannelId);
    if (!forum || forum.type !== ChannelType.GuildForum) throw new Error('Configured storyboard channel is not a Forum channel');
    this.forum = forum; this.health.storyboardFound = true;
    const announcements = await guild.channels.fetch(this.config.announcementsChannelId);
    if (!announcements || announcements.type !== ChannelType.GuildText) throw new Error('Configured announcements channel is not a text channel');
    this.announcements = announcements; this.health.announcementsFound = true;
    const forumPermissions = forum.permissionsFor(guild.members.me!);
    const required = [[PermissionFlagsBits.ViewChannel, 'View Channel'], [PermissionFlagsBits.SendMessagesInThreads, 'Send Messages in Threads'], [PermissionFlagsBits.ManageThreads, 'Manage Threads'], [PermissionFlagsBits.ReadMessageHistory, 'Read Message History']] as const;
    this.health.missingPermissions = required.filter(([permission]) => !forumPermissions?.has(permission)).map(([, name]) => name);
    const announcementPermissions = announcements.permissionsFor(guild.members.me!);
    const announcementRequired = [[PermissionFlagsBits.ViewChannel, 'announcements: View Channel'], [PermissionFlagsBits.SendMessages, 'announcements: Send Messages'], [PermissionFlagsBits.EmbedLinks, 'announcements: Embed Links'], [PermissionFlagsBits.ReadMessageHistory, 'announcements: Read Message History']] as const;
    this.health.missingPermissions.push(...announcementRequired.filter(([permission]) => !announcementPermissions?.has(permission)).map(([, name]) => name));
    if (this.health.missingPermissions.length) throw new Error(`Missing storyboard permissions: ${this.health.missingPermissions.join(', ')}`);
    await ensureWorkflowTags(forum); this.health.managedTagsAvailable = true;
    await this.wordpress.listStories('active'); this.health.wordpressReachable = true;
    this.health.message = 'Ready';
  }

  async syncById(id: number): Promise<Story> { const story = await this.wordpress.storyById(id); return this.sync(story); }
  async sync(story: Story): Promise<Story> {
    if (!this.forum) throw new Error('Storyboard Forum is not initialized');
    let thread: ThreadChannel;
    let cardId = story.discord.cardMessageId;
    if (!story.discord.threadId) {
      const existing = await this.findThreadForStory(story.id);
      if (existing) {
        thread = existing.thread; cardId = existing.cardId;
        story = await this.wordpress.linkStory(story.id, { threadId: thread.id, cardMessageId: cardId });
      } else {
        const created = await this.forum.threads.create({ name: story.title.slice(0, 100), appliedTags: mergeWorkflowTag([], this.forum.availableTags, story.status), message: storyCard(story), reason: `Weekly Wildcat story #${story.id}` });
        thread = created;
        const starter = await created.fetchStarterMessage();
        cardId = starter?.id ?? '';
        story = await this.wordpress.linkStory(story.id, { threadId: created.id, ...(cardId ? { cardMessageId: cardId } : {}) });
      }
    } else {
      const fetched = await this.client.channels.fetch(story.discord.threadId).catch(() => null);
      if (!fetched?.isThread() || fetched.parentId !== this.config.storyboardChannelId) throw new Error(`Linked thread ${story.discord.threadId} is missing; manual editor recovery is required`);
      thread = fetched;
      const desiredTags = mergeWorkflowTag(thread.appliedTags, this.forum.availableTags, story.status);
      if (thread.name !== story.title.slice(0, 100) || JSON.stringify([...thread.appliedTags].sort()) !== JSON.stringify([...desiredTags].sort())) await thread.edit({ name: story.title.slice(0, 100), appliedTags: desiredTags, reason: `Reconcile Weekly Wildcat story #${story.id}` });
      let card = cardId ? await thread.messages.fetch(cardId).catch(() => null) : await this.findMarkedMessage(thread, `WordPress story #${story.id}`);
      if (card) await card.edit(storyCard(story));
      else { card = await thread.send(storyCard(story)); cardId = card.id; story = await this.wordpress.linkStory(story.id, { cardMessageId: cardId }); }
    }
    if (story.status === 'published' && story.publicUrl) story = await this.reconcilePublication(thread, story);
    await this.wordpress.linkStory(story.id, { threadId: thread.id, ...(cardId ? { cardMessageId: cardId } : {}) });
    return story;
  }

  private async reconcilePublication(thread: ThreadChannel, story: Story): Promise<Story> {
    let publishMessageId = story.discord.publishMessageId;
    const publication = { content: `Published: **${story.title}**\n${story.publicUrl}`, embeds: [{ footer: { text: `Publication #${story.id}` } }], allowedMentions: NO_MENTIONS };
    if (publishMessageId) { const message = await thread.messages.fetch(publishMessageId).catch(() => null); if (message) await message.edit(publication); else publishMessageId = ''; }
    if (!publishMessageId) publishMessageId = (await this.findMarkedMessage(thread, `Publication #${story.id}`))?.id ?? '';
    if (!publishMessageId) publishMessageId = (await thread.send(publication)).id;
    let announcementMessageId = story.discord.announcementMessageId;
    if (this.config.publicationAnnouncements && this.announcements) {
      const announcement = { content: `📰 **${story.title}**\n${story.writer ? `By ${story.writer.name}\n` : ''}${story.publicUrl}`, embeds: [{ ...(story.featuredImageUrl ? { image: { url: story.featuredImageUrl } } : {}), footer: { text: `Announcement #${story.id}` } }], allowedMentions: NO_MENTIONS };
      if (announcementMessageId) { const message = await this.announcements.messages.fetch(announcementMessageId).catch(() => null); if (message) await message.edit(announcement); else announcementMessageId = ''; }
      if (!announcementMessageId) announcementMessageId = (await this.findMarkedMessage(this.announcements, `Announcement #${story.id}`))?.id ?? '';
      if (!announcementMessageId) announcementMessageId = (await this.announcements.send(announcement)).id;
    }
    return this.wordpress.linkStory(story.id, { publishMessageId, ...(announcementMessageId ? { announcementMessageId } : {}) });
  }

  async reconcileAll(): Promise<void> {
    const { stories } = await this.wordpress.listStories('active');
    this.health.wordpressReachable = true;
    for (const story of stories) await this.sync(story).catch((error: unknown) => { this.health.message = error instanceof Error ? error.message : 'Story reconciliation failed'; });
    this.health.lastSuccessfulReconciliation = new Date().toISOString();
  }
  private async findMarkedMessage(channel: ThreadChannel | TextChannel, marker: string): Promise<Message | null> {
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    return messages?.find((message) => message.author.id === this.client.user?.id && message.embeds.some((embed) => embed.footer?.text === marker)) ?? null;
  }
  private async findThreadForStory(storyId: number): Promise<{ thread: ThreadChannel; cardId: string } | null> {
    if (!this.forum) return null;
    const active = await this.forum.threads.fetchActive();
    for (const thread of active.threads.values()) {
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter && starter.author.id === this.client.user?.id && starter.embeds.some((embed) => embed.footer?.text === `WordPress story #${storyId}`)) return { thread, cardId: starter.id };
    }
    return null;
  }
  storyboard(): ForumChannel { if (!this.forum) throw new Error('Storyboard Forum unavailable'); return this.forum; }
  announcementChannel(): TextChannel { if (!this.announcements) throw new Error('Announcements channel unavailable'); return this.announcements; }
  async postAnnouncement(title: string, message: string, mentionStaff = false): Promise<string> {
    const channel = this.announcementChannel();
    if (mentionStaff && !this.config.staffRoleId) throw new Error('The staff role is not configured');
    const prefix = mentionStaff ? `<@&${this.config.staffRoleId}>\n` : '';
    const sent = await channel.send({ content: `${prefix}**${title.slice(0, 100)}**\n${message.slice(0, 1800)}`, allowedMentions: mentionStaff ? roleMention(this.config.staffRoleId!) : NO_MENTIONS });
    return sent.id;
  }
}
