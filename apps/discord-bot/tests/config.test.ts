import { describe, expect, it } from 'vitest';
import { loadBootstrap, loadConfig, resolveConfig } from '../src/config.js';

const base = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '12345678901234567',
  BYLINE_DISCORD_GUILD_ID: '12345678901234568',
  BYLINE_DISCORD_STORYBOARD_CHANNEL_ID: '12345678901234569',
  BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID: '12345678901234570',
  BYLINE_WORDPRESS_URL: 'https://cms.harbor-light.test',
  BYLINE_DISCORD_BRIDGE_SECRET: 'x'.repeat(32),
  BYLINE_PUBLICATION_NAME: 'The Harbor Light',
  BYLINE_PUBLICATION_SHORT_NAME: 'Harbor Light',
};

describe('Discord configuration aliases', () => {
  it('uses canonical Byline configuration and publication identity', () => {
    const config = loadConfig(base);
    expect(config.publicationName).toBe('The Harbor Light');
    expect(config.contextMenuCommandName).toBe('Create Harbor Light story');
    expect(config.wordpressUrl).toBe('https://cms.harbor-light.test');
  });

  it('continues to accept every legacy WWH connection variable', () => {
    const legacy = Object.fromEntries(Object.entries(base).map(([key, value]) => [key.replace(/^BYLINE_/, 'WWH_'), value]));
    legacy.DISCORD_TOKEN = base.DISCORD_TOKEN;
    legacy.DISCORD_CLIENT_ID = base.DISCORD_CLIENT_ID;
    const config = loadConfig(legacy);
    expect(config.guildId).toBe(base.BYLINE_DISCORD_GUILD_ID);
    expect(config.bridgeSecret).toBe(base.BYLINE_DISCORD_BRIDGE_SECRET);
    expect(config.publicationName).toBe('The Harbor Light');
  });
});

describe('WordPress-managed connection settings', () => {
  it('lets WordPress override the environment while keeping unset values', () => {
    const config = resolveConfig(
      {
        guildId: '12399999901234568',
        storyboardChannelId: '12399999901234569',
        publicationAnnouncements: false,
        reconcileIntervalMs: 600000,
        publicationShortName: 'Beacon',
      },
      base
    );
    expect(config.guildId).toBe('12399999901234568');
    expect(config.storyboardChannelId).toBe('12399999901234569');
    // Untouched by WordPress, so the environment still supplies it.
    expect(config.announcementsChannelId).toBe(base.BYLINE_DISCORD_ANNOUNCEMENTS_CHANNEL_ID);
    expect(config.publicationAnnouncements).toBe(false);
    expect(config.reconcileIntervalMs).toBe(600000);
    expect(config.contextMenuCommandName).toBe('Create Beacon story');
  });

  it('ignores empty and out-of-range values WordPress has not been given', () => {
    const config = resolveConfig({ guildId: '  ', staffRoleId: '', reconcileIntervalMs: 1000 }, base);
    expect(config.guildId).toBe(base.BYLINE_DISCORD_GUILD_ID);
    expect(config.staffRoleId).toBeUndefined();
    expect(config.reconcileIntervalMs).toBe(300000);
  });

  it('requires only the WordPress URL and bridge secret to bootstrap', () => {
    expect(loadBootstrap(base)).toEqual({ wordpressUrl: base.BYLINE_WORDPRESS_URL, bridgeSecret: base.BYLINE_DISCORD_BRIDGE_SECRET });
    expect(() => loadBootstrap({ BYLINE_WORDPRESS_URL: base.BYLINE_WORDPRESS_URL })).toThrow(/BYLINE_DISCORD_BRIDGE_SECRET/);
  });
});
