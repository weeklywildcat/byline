import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, ContextMenuCommandInteraction, MessageContextMenuCommandInteraction,
  MessageFlags, ModalBuilder, ModalSubmitInteraction, TextInputBuilder, TextInputStyle, type ButtonInteraction, type Interaction, type ThreadChannel,
} from 'discord.js';
import type { Config } from '../config.js';
import { assertStoryboardThread, isWorkflowStatus } from '../discord/forums.js';
import { NO_MENTIONS, roleMention, storySummary, userMention } from '../discord/messages.js';
import { validDeadline } from '../services/story-state.js';
import type { StorySyncService } from '../services/story-sync.js';
import { WordPressClient, WordPressError } from '../wordpress/client.js';
import type { Story } from '../wordpress/types.js';

const ephemeral = { flags: MessageFlags.Ephemeral, allowedMentions: NO_MENTIONS } as const;
function threadFor(interaction: Interaction): ThreadChannel { const channel = interaction.channel; if (!channel?.isThread()) throw new Error('Use this command inside a storyboard Forum thread.'); return channel; }
function friendly(error: unknown): string { if (error instanceof WordPressError && error.status < 500) return error.message; if (error instanceof Error && !/token|secret/i.test(error.message)) return error.message; return 'Wildcat could not complete that request. Please try again shortly.'; }
function storyList(stories: Story[], guildId: string): string { return stories.length ? stories.slice(0, 20).map((story) => `• [${story.title}](${story.discord.threadId ? `https://discord.com/channels/${guildId}/${story.discord.threadId}` : story.wordpressUrl}) — ${story.status}${story.deadline ? ` · ${story.deadline}` : ''}`).join('\n') : 'No matching active stories.'; }

export class CommandHandler {
  constructor(private readonly wordpress: WordPressClient, private readonly sync: StorySyncService, private readonly config: Config) {}
  async handle(interaction: Interaction): Promise<void> {
    try {
      if (interaction.isChatInputCommand()) await this.chat(interaction);
      else if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Create Weekly Wildcat story') await this.promote(interaction);
      else if (interaction.isButton()) await this.button(interaction);
      else if (interaction.isModalSubmit()) await this.modal(interaction);
    } catch (error) {
      const content = friendly(error);
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply({ content, embeds: [], components: [], allowedMentions: NO_MENTIONS }).catch(() => undefined);
        else await interaction.reply({ content, ...ephemeral }).catch(() => undefined);
      }
    }
  }

  private async chat(interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.commandName === 'announce') { await this.showAnnouncement(interaction); return; }
    await interaction.deferReply(ephemeral);
    if (interaction.commandName === 'story') await this.story(interaction);
    else if (interaction.commandName === 'stories') await this.stories(interaction);
    else if (interaction.commandName === 'editing') { const result = await this.wordpress.listStories('editing', interaction.user.id); await interaction.editReply({ content: storyList(result.stories, this.config.guildId), allowedMentions: NO_MENTIONS }); }
    else if (interaction.commandName === 'sync') { const thread = threadFor(interaction); assertStoryboardThread(thread, this.config.storyboardChannelId); const actor = await this.wordpress.resolveUser(interaction.user.id); if (!actor.capabilities.editOthersPosts && !actor.capabilities.manageOptions) throw new Error('Only an editor can force reconciliation.'); const story = await this.wordpress.storyByThread(thread.id, interaction.user.id); await this.sync.sync(story); await interaction.editReply({ content: `Reconciled **${story.title}**.`, allowedMentions: NO_MENTIONS }); }
  }

  private async story(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'create') { await this.promoteDeferred(interaction); return; }
    const thread = threadFor(interaction); assertStoryboardThread(thread, this.config.storyboardChannelId);
    const story = await this.wordpress.storyByThread(thread.id, interaction.user.id);
    if (subcommand === 'info') await interaction.editReply({ content: storySummary(story), allowedMentions: NO_MENTIONS });
    else if (subcommand === 'open') await interaction.editReply({ content: `[Open **${story.title}** in WordPress](${story.wordpressUrl})`, allowedMentions: NO_MENTIONS });
    else if (subcommand === 'status') {
      const status = interaction.options.getString('stage', true); if (!isWorkflowStatus(status) || status === 'published') throw new Error('Choose a valid workflow stage.');
      const updated = await this.wordpress.updateStory(story.id, { operation: 'status', status, actorDiscordUserId: interaction.user.id }); await this.sync.sync(updated);
      await interaction.editReply({ content: `Moved **${updated.title}** to ${status}.`, allowedMentions: NO_MENTIONS });
    } else if (subcommand === 'deadline') {
      const deadline = interaction.options.getString('date', true); if (!validDeadline(deadline)) throw new Error('Use a valid deadline in YYYY-MM-DD format.');
      const updated = await this.wordpress.updateStory(story.id, { operation: 'deadline', deadline, actorDiscordUserId: interaction.user.id }); await this.sync.sync(updated);
      await interaction.editReply({ content: `Deadline set to ${deadline}.`, allowedMentions: NO_MENTIONS });
    } else if (subcommand === 'assign') {
      const role = interaction.options.getString('role', true); const target = interaction.options.getUser('user', true); const oldWriter = story.writer?.discordUserId;
      const updated = await this.wordpress.updateStory(story.id, { operation: 'assign', role, targetDiscordUserId: target.id, actorDiscordUserId: interaction.user.id }); await this.sync.sync(updated);
      if (role === 'writer' && target.id !== oldWriter) await thread.send({ content: `<@${target.id}> has been assigned to this story.`, allowedMentions: userMention(target.id) });
      await interaction.editReply({ content: `${target.displayName} is now the ${role}.`, allowedMentions: NO_MENTIONS });
    } else if (subcommand === 'unlink') {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`unlink:${story.id}`).setLabel('Confirm unlink').setStyle(ButtonStyle.Danger));
      await interaction.editReply({ content: 'Unlinking keeps both the WordPress story and Discord discussion. Confirm?', components: [row], allowedMentions: NO_MENTIONS });
    }
  }

  private async stories(interaction: ChatInputCommandInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    const scope = subcommand === 'mine' ? 'mine' : interaction.options.getString('when', true);
    const result = await this.wordpress.listStories(scope, interaction.user.id);
    await interaction.editReply({ content: storyList(result.stories, this.config.guildId), allowedMentions: NO_MENTIONS });
  }

  private async promote(interaction: MessageContextMenuCommandInteraction): Promise<void> { await interaction.deferReply(ephemeral); await this.promoteDeferred(interaction); }
  private async promoteDeferred(interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction): Promise<void> {
    const thread = threadFor(interaction); assertStoryboardThread(thread, this.config.storyboardChannelId);
    const result = await this.wordpress.createStory(thread.id, thread.name, interaction.user.id, `promote-${thread.id}`);
    const story = await this.sync.sync(result.story);
    await interaction.editReply({ content: `${result.created ? 'Created' : 'Found the existing'} WordPress story **${story.title}**.\n[Open WordPress](${story.wordpressUrl}) · [Open Discord](https://discord.com/channels/${interaction.guildId}/${thread.id})`, allowedMentions: NO_MENTIONS });
  }

  private async button(interaction: ButtonInteraction): Promise<void> {
    if (!interaction.customId.startsWith('unlink:')) return;
    await interaction.deferReply(ephemeral); const storyId = Number(interaction.customId.slice(7));
    await this.wordpress.unlinkStory(storyId, interaction.user.id); await interaction.editReply({ content: 'Story unlinked. Neither record was deleted.', allowedMentions: NO_MENTIONS });
  }

  private async showAnnouncement(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder().setCustomId('announce-modal').setTitle('Post to announcements').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Message').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1800)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('mention').setLabel('Mention (leave blank or enter staff)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(5)),
    );
    await interaction.showModal(modal);
  }

  private async modal(interaction: ModalSubmitInteraction): Promise<void> {
    if (interaction.customId !== 'announce-modal') return;
    await interaction.deferReply(ephemeral); const resolved = await this.wordpress.resolveUser(interaction.user.id);
    if (!resolved.capabilities.publishPosts && !resolved.capabilities.editOthersPosts) throw new Error('Only an editor can post announcements.');
    const title = interaction.fields.getTextInputValue('title'); const message = interaction.fields.getTextInputValue('message'); const mention = interaction.fields.getTextInputValue('mention').trim().toLowerCase();
    if (mention && mention !== 'staff') throw new Error('Mention must be blank or “staff”.');
    if (mention === 'staff' && !this.config.staffRoleId) throw new Error('The staff role is not configured.');
    const prefix = mention === 'staff' ? `<@&${this.config.staffRoleId}>\n` : '';
    await this.sync.announcementChannel().send({ content: `${prefix}**${title}**\n${message}`, allowedMentions: mention === 'staff' ? roleMention(this.config.staffRoleId!) : NO_MENTIONS });
    await interaction.editReply({ content: 'Announcement posted.', allowedMentions: NO_MENTIONS });
  }
}
