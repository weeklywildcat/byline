import { describe, expect, it } from 'vitest';
import { signRequest, verifyRequest } from '../src/security/signing.js';
describe('bridge signing', () => {
  it('signs and verifies exact method, path, timestamp, and body', () => { const now = 1_800_000_000_000; const timestamp = String(now / 1000); const signature = signRequest('secret', timestamp, 'POST', '/sync', '{"storyId":4}'); expect(verifyRequest('secret', timestamp, signature, 'POST', '/sync', '{"storyId":4}', now)).toBe(true); expect(verifyRequest('secret', timestamp, signature, 'POST', '/sync', '{"storyId":5}', now)).toBe(false); });
  it('rejects stale or future timestamps', () => { const now = 1_800_000_000_000; for (const timestamp of [String(now / 1000 - 301), String(now / 1000 + 301)]) expect(verifyRequest('secret', timestamp, signRequest('secret', timestamp, 'GET', '/x', ''), 'GET', '/x', '', now)).toBe(false); });
});
