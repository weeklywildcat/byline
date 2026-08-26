import { describe, expect, it, vi } from 'vitest';
import type { Config } from '../src/config.js';
import { WordPressClient, WordPressError } from '../src/wordpress/client.js';
const config = { wordpressUrl: 'https://cms.example', bridgeSecret: 'secret' } as Config;
describe('WordPress boundary', () => {
  it('returns capability/account failures without hiding them', async () => { const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'wwh_account_unlinked', message: 'Account not linked' }), { status: 403, headers: { 'content-type': 'application/json' } })); await expect(new WordPressClient(config, fetcher).resolveUser('12345678901234567')).rejects.toMatchObject({ status: 403, code: 'wwh_account_unlinked' } satisfies Partial<WordPressError>); });
  it('uses canonical and legacy headers with one stable idempotency key', async () => { const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ created: false, story: { id: 9 } }), { status: 200, headers: { 'content-type': 'application/json' } })); await new WordPressClient(config, fetcher).createStory('12345678901234567', 'Pitch', '22345678901234567', 'promote-123'); const headers = fetcher.mock.calls[0]![1].headers; expect(headers['x-byline-request-id']).toBe('promote-123'); expect(headers['x-wwh-request-id']).toBe('promote-123'); expect(headers['x-byline-signature']).toMatch(/^[a-f0-9]{64}$/); });
  it('distinguishes linked and unlinked thread lookups', async () => { const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'wwh_story_not_found', message: 'not linked' }), { status: 404 })); await expect(new WordPressClient(config, fetcher).storyByThread('12345678901234567')).rejects.toMatchObject({ status: 404 }); });
});
