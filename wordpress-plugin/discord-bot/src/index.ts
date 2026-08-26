import { ChannelType, Client, Events, GatewayIntentBits } from 'discord.js';
import pino from 'pino';
import { CommandHandler } from './commands/handler.js';
import { commandDefinitions } from './commands/definitions.js';
import { loadConfig } from './config.js';
import { syncCommands } from './discord/command-sync.js';
import { matchingTag, WORKFLOW_TAGS } from './discord/forums.js';
import { startHttpServer } from './http/server.js';
import { StorySyncService } from './services/story-sync.js';
import { WordPressClient, WordPressError } from './wordpress/client.js';
import type { WorkflowStatus } from './wordpress/types.js';

const config = loadConfig();
const logger = pino({ level: config.logLevel, redact: ['discordToken', 'bridgeSecret', 'req.headers.authorization', 'headers.authorization'] });
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const wordpress = new WordPressClient(config);
const sync = new StorySyncService(client, wordpress, config);
const commands = new CommandHandler(wordpress, sync, config);
const server = startHttpServer(config, sync);
let interval: NodeJS.Timeout | undefined;

client.on(Events.InteractionCreate, (interaction) => { void commands.handle(interaction).catch((error) => logger.error({ err: error }, 'interaction failed')); });
client.on(Events.ThreadCreate, () => { /* An unlinked Forum post remains a pitch. Deliberately no side effects. */ });
client.on(Events.ThreadUpdate, (before, after) => {
  if (after.parentId !== config.storyboardChannelId) return;
  void (async () => {
    const story = await wordpress.storyByThread(after.id).catch((error) => { if (error instanceof WordPressError && error.status === 404) return null; throw error; });
    if (!story) return;
    const forum = after.parent?.type === ChannelType.GuildForum ? after.parent : sync.storyboard();
    const statuses = Object.keys(WORKFLOW_TAGS) as WorkflowStatus[];
    const detected = statuses.find((status) => { const tag = matchingTag(forum.availableTags, status); return tag && after.appliedTags.includes(tag.id) && !before.appliedTags.includes(tag.id); })
      ?? statuses.find((status) => { const tag = matchingTag(forum.availableTags, status); return status === story.status && tag && after.appliedTags.includes(tag.id); });
    const updates: Record<string, unknown> = { operation: 'discord-sync' };
    if (after.name !== story.title) updates.title = after.name;
    if (detected && detected !== story.status && detected !== 'published') updates.status = detected;
    if (Object.keys(updates).length > 1) await sync.sync(await wordpress.updateStory(story.id, updates));
  })().catch((error) => logger.warn({ err: error, threadId: after.id }, 'Discord thread update could not be synchronized'));
});

client.once(Events.ClientReady, async (readyClient) => {
  try {
    sync.health.discordConnected = true;
    await sync.initialize();
    const changed = await syncCommands(readyClient, config.discordClientId, config.guildId, commandDefinitions(config.publicationShortName));
    logger.info({ changed }, 'guild application commands synchronized');
    await sync.reconcileAll();
    interval = setInterval(() => { void sync.reconcileAll().catch((error) => { sync.health.wordpressReachable = false; sync.health.message = error instanceof Error ? error.message : 'Reconciliation failed'; logger.error({ err: error }, 'reconciliation failed'); }); }, config.reconcileIntervalMs);
  } catch (error) { sync.health.message = error instanceof Error ? error.message : 'Startup validation failed'; logger.error({ err: error }, 'startup validation failed'); }
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down'); if (interval) clearInterval(interval);
  await new Promise<void>((resolve) => server.close(() => resolve())); client.destroy();
}
process.once('SIGTERM', () => { void shutdown('SIGTERM').then(() => process.exit(0)); });
process.once('SIGINT', () => { void shutdown('SIGINT').then(() => process.exit(0)); });
client.login(config.discordToken).catch((error) => { logger.fatal({ err: error }, 'Discord login failed'); process.exitCode = 1; });
