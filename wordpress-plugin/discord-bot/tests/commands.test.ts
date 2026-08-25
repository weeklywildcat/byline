import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../src/commands/definitions.js';
import { commandsEqual } from '../src/discord/command-sync.js';
import { NO_MENTIONS, roleMention, userMention } from '../src/discord/messages.js';
describe('application commands and mention safety', () => {
  it('generates every required top-level guild command once', () => expect(commandDefinitions().map((command) => command.name)).toEqual(['story', 'stories', 'editing', 'announce', 'sync', 'Create Weekly Wildcat story']));
  it('never enables parsed mentions', () => { expect(NO_MENTIONS.parse).toEqual([]); expect(userMention('123').users).toEqual(['123']); expect(userMention('123').roles).toEqual([]); expect(roleMention('456').roles).toEqual(['456']); });
  it('does not resync commands for Discord response-only defaults', () => { const desired = commandDefinitions(); const current = desired.map((command, index) => ({ ...command, id: String(index), application_id: 'app', guild_id: 'guild', version: '1', dm_permission: true, default_member_permissions: null, nsfw: false, integration_types: [0], contexts: [0] })); expect(commandsEqual(current, desired)).toBe(true); });
});
