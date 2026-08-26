import { ApplicationCommandType, SlashCommandBuilder, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js';
import { WORKFLOW_TAGS } from '../discord/forums.js';

export function commandDefinitions(publicationShortName = 'Byline'): RESTPostAPIApplicationCommandsJSONBody[] {
  const statuses = Object.entries(WORKFLOW_TAGS).filter(([value]) => value !== 'published').map(([value, tag]) => ({ name: `${tag.emoji} ${tag.name}`, value }));
  return [
    new SlashCommandBuilder().setName('story').setDescription('Manage the story linked to this storyboard thread')
      .addSubcommand((c) => c.setName('create').setDescription('Promote this pitch into a WordPress story'))
      .addSubcommand((c) => c.setName('info').setDescription('Show the linked story details'))
      .addSubcommand((c) => c.setName('open').setDescription('Open the linked story in WordPress'))
      .addSubcommand((c) => c.setName('status').setDescription('Change editorial workflow stage').addStringOption((o) => o.setName('stage').setDescription('New workflow stage').setRequired(true).addChoices(...statuses)))
      .addSubcommand((c) => c.setName('assign').setDescription('Assign a linked account').addStringOption((o) => o.setName('role').setDescription('Assignment role').setRequired(true).addChoices({ name: 'Writer', value: 'writer' }, { name: 'Editor', value: 'editor' })).addUserOption((o) => o.setName('user').setDescription('Discord user with a linked account').setRequired(true)))
      .addSubcommand((c) => c.setName('deadline').setDescription('Set the deadline').addStringOption((o) => o.setName('date').setDescription('YYYY-MM-DD').setRequired(true)))
      .addSubcommand((c) => c.setName('unlink').setDescription('Disconnect WordPress and Discord without deleting either')),
    new SlashCommandBuilder().setName('stories').setDescription('Find newsroom assignments')
      .addSubcommand((c) => c.setName('mine').setDescription('Show your active assignments'))
      .addSubcommand((c) => c.setName('due').setDescription('Show stories by deadline').addStringOption((o) => o.setName('when').setDescription('Deadline window').setRequired(true).addChoices({ name: 'Today', value: 'today' }, { name: 'Tomorrow', value: 'tomorrow' }, { name: 'This week', value: 'this-week' }, { name: 'Overdue', value: 'overdue' }))),
    new SlashCommandBuilder().setName('editing').setDescription('Show stories awaiting editing'),
    new SlashCommandBuilder().setName('announce').setDescription('Post an editor announcement'),
    new SlashCommandBuilder().setName('sync').setDescription('Reconcile this linked story with WordPress'),
    { name: `Create ${publicationShortName} story`.slice(0, 32).trim(), type: ApplicationCommandType.Message } as RESTPostAPIApplicationCommandsJSONBody,
  ].map((definition) => 'toJSON' in definition ? definition.toJSON() : definition);
}
