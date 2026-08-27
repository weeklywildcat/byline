import { randomUUID } from 'node:crypto';
import type { Bootstrap, Config, RemoteConfig } from '../config.js';
import { signRequest } from '../security/signing.js';
import type { CreateStoryResult, ResolvedUser, Story } from './types.js';

const CONFIG_ROUTE = '/byline/v1/discord/config';

/**
 * Reads the connection settings WordPress manages. Called before a Config
 * exists, so it takes only the two bootstrap values and signs the request the
 * same way every other bridge call does.
 */
export async function fetchRemoteConfig(bootstrap: Bootstrap, fetcher: typeof fetch = fetch): Promise<RemoteConfig> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetcher(`${bootstrap.wordpressUrl.replace(/\/$/, '')}/wp-json${CONFIG_ROUTE}`, {
    method: 'GET',
    headers: {
      'content-type': 'application/json',
      'x-byline-timestamp': timestamp,
      'x-byline-signature': signRequest(bootstrap.bridgeSecret, timestamp, 'GET', CONFIG_ROUTE, ''),
    },
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new WordPressError(String(payload.message ?? 'WordPress did not return Discord settings.'), response.status);
  return payload as RemoteConfig;
}

export class WordPressError extends Error { constructor(message: string, readonly status: number, readonly code?: string) { super(message); } }

export class WordPressClient {
  constructor(private readonly config: Config, private readonly fetcher: typeof fetch = fetch) {}
  private async request<T>(method: string, route: string, data?: unknown, requestId?: string): Promise<T> {
    const body = data === undefined ? '' : JSON.stringify(data);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signingRoute = route.split('?', 1)[0]!;
    const response = await this.fetcher(`${this.config.wordpressUrl}/wp-json${route}`, { method, headers: {
      'content-type': 'application/json',
      'x-byline-timestamp': timestamp,
      'x-byline-signature': signRequest(this.config.bridgeSecret, timestamp, method, signingRoute, body),
      // Legacy headers keep the bot compatible with an older installed plugin during rolling updates.
      'x-wwh-timestamp': timestamp,
      'x-wwh-signature': signRequest(this.config.bridgeSecret, timestamp, method, signingRoute, body),
      ...(requestId ? { 'x-byline-request-id': requestId, 'x-wwh-request-id': requestId } : {}),
    }, ...(body ? { body } : {}) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new WordPressError(String(payload.message ?? 'WordPress request failed.'), response.status, typeof payload.code === 'string' ? payload.code : undefined);
    return payload as T;
  }
  storyById(id: number) { return this.request<Story>('GET', `/weekly-wildcat/v1/discord/story?id=${id}`); }
  storyByThread(threadId: string, actorDiscordUserId?: string) { const query = new URLSearchParams({ threadId, ...(actorDiscordUserId ? { actorDiscordUserId } : {}) }); return this.request<Story>('GET', `/weekly-wildcat/v1/discord/story?${query}`); }
  createStory(threadId: string, title: string, actorDiscordUserId: string, requestId: string = randomUUID()) { return this.request<CreateStoryResult>('POST', '/weekly-wildcat/v1/discord/stories', { threadId, title, actorDiscordUserId }, requestId); }
  updateStory(id: number, data: Record<string, unknown>) { return this.request<Story>('PATCH', `/weekly-wildcat/v1/discord/stories/${id}`, data, randomUUID()); }
  linkStory(id: number, discord: Partial<Story['discord']>) { return this.request<Story>('POST', `/weekly-wildcat/v1/discord/stories/${id}/link`, discord, randomUUID()); }
  unlinkStory(id: number, actorDiscordUserId: string) { return this.request<{ unlinked: boolean }>('DELETE', `/weekly-wildcat/v1/discord/stories/${id}/link`, { actorDiscordUserId }, randomUUID()); }
  resolveUser(discordId: string) { return this.request<ResolvedUser>('GET', `/weekly-wildcat/v1/discord/users/${discordId}`); }
  listStories(scope: string, actorDiscordUserId?: string) { const query = new URLSearchParams({ scope, ...(actorDiscordUserId ? { actorDiscordUserId } : {}) }); return this.request<{ stories: Story[] }>('GET', `/weekly-wildcat/v1/discord/stories?${query}`); }
}
