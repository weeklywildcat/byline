import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { WORKFLOW_TAGS } from './forums.js';
import type { Story } from '../wordpress/types.js';

export const NO_MENTIONS = Object.freeze({ parse: [] as never[], users: [] as string[], roles: [] as string[], repliedUser: false });
export const userMention = (id: string) => ({ parse: [] as never[], users: [id], roles: [] as string[], repliedUser: false });
export const roleMention = (id: string) => ({ parse: [] as never[], users: [] as string[], roles: [id], repliedUser: false });

export function storyCard(story: Story) {
  const status = WORKFLOW_TAGS[story.status];
  const fields = [
    { name: 'Workflow', value: `${status.emoji} ${status.name}`, inline: true },
    { name: 'Writer', value: story.writer?.name ?? 'Unassigned', inline: true },
    { name: 'Editor', value: story.editor?.name ?? 'Unassigned', inline: true },
    ...(story.deadline ? [{ name: 'Deadline', value: `<t:${Math.floor(new Date(`${story.deadline}T17:00:00Z`).valueOf() / 1000)}:D>`, inline: true }] : []),
    ...(story.section ? [{ name: 'Section', value: story.section, inline: true }] : []),
    ...(story.visuals ? [{ name: 'Visuals', value: story.visuals.slice(0, 1024), inline: false }] : []),
  ];
  return { embeds: [new EmbedBuilder().setTitle(story.title.slice(0, 256)).setColor(story.status === 'published' ? 0x2d7d46 : 0x27272a).setFields(fields).setFooter({ text: `WordPress story #${story.id}` })],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open in WordPress').setURL(story.wordpressUrl))], allowedMentions: NO_MENTIONS };
}

export function storySummary(story: Story): string {
  const status = WORKFLOW_TAGS[story.status];
  return [`**${story.title}**`, `${status.emoji} ${status.name}`, `Writer: ${story.writer?.name ?? 'Unassigned'} · Editor: ${story.editor?.name ?? 'Unassigned'}`, story.deadline ? `Deadline: ${story.deadline}` : '', story.section ? `Section: ${story.section}` : '', story.visuals ? `Visuals: ${story.visuals}` : '', `[Open in WordPress](${story.wordpressUrl})`].filter(Boolean).join('\n');
}
