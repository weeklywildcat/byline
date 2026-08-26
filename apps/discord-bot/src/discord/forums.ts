import { ChannelType, ForumChannel, PermissionFlagsBits, type GuildForumTag, type ThreadChannel } from 'discord.js';
import type { WorkflowStatus } from '../wordpress/types.js';

export const WORKFLOW_TAGS: Readonly<Record<WorkflowStatus, { name: string; emoji: string }>> = {
  pitch: { name: 'Pitch', emoji: '💡' }, assigned: { name: 'Assigned', emoji: '👤' }, reporting: { name: 'Reporting', emoji: '🔎' },
  writing: { name: 'Writing', emoji: '✍️' }, editing: { name: 'Editing', emoji: '📝' }, ready: { name: 'Ready', emoji: '✅' },
  published: { name: 'Published', emoji: '🌐' }, 'on-hold': { name: 'On hold', emoji: '⏸️' }, dropped: { name: 'Dropped', emoji: '❌' },
};

export function matchingTag(tags: readonly GuildForumTag[], status: WorkflowStatus): GuildForumTag | undefined {
  const desired = WORKFLOW_TAGS[status];
  return tags.find((tag) => tag.name.toLowerCase() === desired.name.toLowerCase() && tag.emoji?.name === desired.emoji);
}

export function managedTagIds(tags: readonly GuildForumTag[]): Set<string> {
  return new Set(tags.filter((tag) => Object.values(WORKFLOW_TAGS).some((managed) => tag.name.toLowerCase() === managed.name.toLowerCase() && tag.emoji?.name === managed.emoji)).map((tag) => tag.id));
}

export function mergeWorkflowTag(applied: readonly string[], available: readonly GuildForumTag[], status: WorkflowStatus): string[] {
  const desired = matchingTag(available, status);
  if (!desired) throw new Error(`Missing managed Forum tag: ${WORKFLOW_TAGS[status].emoji} ${WORKFLOW_TAGS[status].name}`);
  const managed = managedTagIds(available);
  const unrelated = applied.filter((id) => !managed.has(id));
  if (unrelated.length >= 5) throw new Error('This thread already has five unrelated Forum tags; remove one before Byline can apply its workflow tag');
  return [...unrelated, desired.id];
}

export async function ensureWorkflowTags(forum: ForumChannel): Promise<void> {
  let tags = forum.availableTags;
  const missing = Object.values(WORKFLOW_TAGS).filter((definition) => !tags.some((tag) => tag.name.toLowerCase() === definition.name.toLowerCase() && tag.emoji?.name === definition.emoji));
  if (!missing.length) return;
  const permissions = forum.permissionsFor(forum.guild.members.me!);
  if (!permissions?.has(PermissionFlagsBits.ManageChannels)) throw new Error(`Missing Manage Channels permission; required to create ${missing.length} workflow tag(s)`);
  if (tags.length + missing.length > 20) throw new Error(`Storyboard Forum has ${tags.length} tags and cannot fit all managed workflow tags (20 maximum)`);
  tags = [...tags, ...missing.map((tag) => ({ name: tag.name, moderated: false, emoji: { name: tag.emoji } }))] as GuildForumTag[];
  await forum.setAvailableTags(tags);
}

export function assertStoryboardThread(thread: ThreadChannel, storyboardId: string): void {
  if (thread.parentId !== storyboardId || thread.parent?.type !== ChannelType.GuildForum) throw new Error('Use this command inside a thread in the configured storyboard Forum.');
}

export function isWorkflowStatus(value: string): value is WorkflowStatus { return Object.prototype.hasOwnProperty.call(WORKFLOW_TAGS, value); }
