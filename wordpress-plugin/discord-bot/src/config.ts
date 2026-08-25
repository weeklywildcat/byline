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
  logLevel: string;
}

const snowflake = /^[1-9][0-9]{16,21}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'WWH_DISCORD_GUILD_ID', 'WWH_DISCORD_STORYBOARD_CHANNEL_ID', 'WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID', 'WWH_WORDPRESS_URL', 'WWH_DISCORD_BRIDGE_SECRET'] as const;
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (env.WWH_DISCORD_BRIDGE_SECRET!.length < 32) throw new Error('WWH_DISCORD_BRIDGE_SECRET must be at least 32 characters');
  for (const key of ['DISCORD_CLIENT_ID', 'WWH_DISCORD_GUILD_ID', 'WWH_DISCORD_STORYBOARD_CHANNEL_ID', 'WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID'] as const) {
    if (!snowflake.test(env[key]!.trim())) throw new Error(`${key} must be a Discord Snowflake ID`);
  }
  if (env.WWH_DISCORD_STAFF_ROLE_ID && !snowflake.test(env.WWH_DISCORD_STAFF_ROLE_ID)) throw new Error('WWH_DISCORD_STAFF_ROLE_ID must be a Discord Snowflake ID');
  const wordpress = new URL(env.WWH_WORDPRESS_URL!);
  if (wordpress.protocol !== 'https:' && !['localhost', '127.0.0.1', 'wordpress'].includes(wordpress.hostname)) throw new Error('WWH_WORDPRESS_URL must use HTTPS outside a trusted local network');
  const port = Number(env.WWH_HTTP_PORT ?? 3000);
  const interval = Number(env.WWH_RECONCILE_INTERVAL_MS ?? 300000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('WWH_HTTP_PORT is invalid');
  if (!Number.isFinite(interval) || interval < 60000) throw new Error('WWH_RECONCILE_INTERVAL_MS must be at least 60000');
  return {
    discordToken: env.DISCORD_TOKEN!, discordClientId: env.DISCORD_CLIENT_ID!, guildId: env.WWH_DISCORD_GUILD_ID!,
    storyboardChannelId: env.WWH_DISCORD_STORYBOARD_CHANNEL_ID!, announcementsChannelId: env.WWH_DISCORD_ANNOUNCEMENTS_CHANNEL_ID!,
    ...(env.WWH_DISCORD_STAFF_ROLE_ID ? { staffRoleId: env.WWH_DISCORD_STAFF_ROLE_ID } : {}), wordpressUrl: wordpress.toString().replace(/\/$/, ''),
    bridgeSecret: env.WWH_DISCORD_BRIDGE_SECRET!, httpHost: env.WWH_HTTP_HOST ?? '0.0.0.0', httpPort: port,
    reconcileIntervalMs: interval, publicationAnnouncements: env.WWH_PUBLICATION_ANNOUNCEMENTS !== 'false', logLevel: env.LOG_LEVEL ?? 'info',
  };
}
