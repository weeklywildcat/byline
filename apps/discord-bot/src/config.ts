export interface Config {
  discordToken: string;
  discordClientId: string;
  guildId: string;
  storyboardChannelId: string;
  announcementsChannelId: string;
  staffRoleId?: string;
  wordpressUrl: string;
  bridgeSecret: string;
  httpHost: string;
  httpPort: number;
  reconcileIntervalMs: number;
  publicationAnnouncements: boolean;
  publicationName: string;
  publicationShortName: string;
  contextMenuCommandName: string;
  logLevel: string;
}

const snowflake = /^[1-9][0-9]{16,21}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const alias = (canonical: string, legacy: string): string => env[canonical]?.trim() || env[legacy]?.trim() || '';
  const values = {
    guildId: alias('BYLINE_DISCORD_GUILD_ID', 'WWH_DISCORD_GUILD_ID'),
    storyboardChannelId: alias('BYLINE_DISCORD_STORYBOARD_CHANNEL_ID', 'WWH_DISCORD_STORYBOARD_CHANNEL_ID'),
    announcementsChannelId: alias('BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID', 'WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID'),
    staffRoleId: alias('BYLINE_DISCORD_STAFF_ROLE_ID', 'WWH_DISCORD_STAFF_ROLE_ID'),
    wordpressUrl: alias('BYLINE_WORDPRESS_URL', 'WWH_WORDPRESS_URL'),
    bridgeSecret: alias('BYLINE_DISCORD_BRIDGE_SECRET', 'WWH_DISCORD_BRIDGE_SECRET'),
  };
  const required = {
    DISCORD_TOKEN: env.DISCORD_TOKEN?.trim() || '',
    DISCORD_CLIENT_ID: env.DISCORD_CLIENT_ID?.trim() || '',
    BYLINE_DISCORD_GUILD_ID: values.guildId,
    BYLINE_DISCORD_STORYBOARD_CHANNEL_ID: values.storyboardChannelId,
    BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID: values.announcementsChannelId,
    BYLINE_WORDPRESS_URL: values.wordpressUrl,
    BYLINE_DISCORD_BRIDGE_SECRET: values.bridgeSecret,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (values.bridgeSecret.length < 32) throw new Error('BYLINE_DISCORD_BRIDGE_SECRET (or legacy WWH_DISCORD_BRIDGE_SECRET) must be at least 32 characters');
  for (const [key, value] of Object.entries({ DISCORD_CLIENT_ID: required.DISCORD_CLIENT_ID, BYLINE_DISCORD_GUILD_ID: values.guildId, BYLINE_DISCORD_STORYBOARD_CHANNEL_ID: values.storyboardChannelId, BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID: values.announcementsChannelId })) {
    if (!snowflake.test(value)) throw new Error(`${key} must be a Discord Snowflake ID`);
  }
  if (values.staffRoleId && !snowflake.test(values.staffRoleId)) throw new Error('BYLINE_DISCORD_STAFF_ROLE_ID must be a Discord Snowflake ID');
  const wordpress = new URL(values.wordpressUrl);
  if (wordpress.protocol !== 'https:' && !['localhost', '127.0.0.1', 'wordpress'].includes(wordpress.hostname)) throw new Error('BYLINE_WORDPRESS_URL must use HTTPS outside a trusted local network');
  const port = Number(alias('BYLINE_HTTP_PORT', 'WWH_HTTP_PORT') || 3000);
  const interval = Number(alias('BYLINE_RECONCILE_INTERVAL_MS', 'WWH_RECONCILE_INTERVAL_MS') || 300000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('BYLINE_HTTP_PORT is invalid');
  if (!Number.isFinite(interval) || interval < 60000) throw new Error('BYLINE_RECONCILE_INTERVAL_MS must be at least 60000');
  const publicationName = alias('BYLINE_PUBLICATION_NAME', 'WWH_PUBLICATION_NAME') || 'Byline';
  const publicationShortName = alias('BYLINE_PUBLICATION_SHORT_NAME', 'WWH_PUBLICATION_SHORT_NAME') || publicationName;
  const contextMenuCommandName = `Create ${publicationShortName} story`.slice(0, 32).trim();
  return {
    discordToken: required.DISCORD_TOKEN, discordClientId: required.DISCORD_CLIENT_ID, guildId: values.guildId,
    storyboardChannelId: values.storyboardChannelId, announcementsChannelId: values.announcementsChannelId,
    ...(values.staffRoleId ? { staffRoleId: values.staffRoleId } : {}), wordpressUrl: wordpress.toString().replace(/\/$/, ''),
    bridgeSecret: values.bridgeSecret, httpHost: alias('BYLINE_HTTP_HOST', 'WWH_HTTP_HOST') || '0.0.0.0', httpPort: port,
    reconcileIntervalMs: interval, publicationAnnouncements: (alias('BYLINE_PUBLICATION_ANNOUNCEMENTS', 'WWH_PUBLICATION_ANNOUNCEMENTS') || 'true') !== 'false',
    publicationName, publicationShortName, contextMenuCommandName, logLevel: env.LOG_LEVEL ?? 'info',
  };
}
