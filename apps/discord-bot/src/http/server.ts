import { createServer, type Server } from 'node:http';
import type { Config } from '../config.js';
import { verifyRequest } from '../security/signing.js';
import type { StorySyncService } from '../services/story-sync.js';

export function startHttpServer(config: Config, sync: StorySyncService): Server {
  const seen = new Map<string, number>();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      const ready = sync.health.discordConnected && sync.health.guildFound && sync.health.storyboardFound && sync.health.announcementsFound && sync.health.wordpressReachable && sync.health.managedTagsAvailable && !sync.health.missingPermissions.length;
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ healthy: true, ready, version: process.env.npm_package_version ?? '1.0.0', ...sync.health })); return;
    }
    if (request.method !== 'POST' || !['/sync', '/announce'].includes(url.pathname)) { response.writeHead(404).end(); return; }
    let body = '';
    for await (const chunk of request) { body += String(chunk); if (body.length > 64_000) { response.writeHead(413).end(); return; } }
    const timestamp = String(request.headers['x-wwh-timestamp'] ?? ''); const signature = String(request.headers['x-wwh-signature'] ?? '');
    if (!verifyRequest(config.bridgeSecret, timestamp, signature, 'POST', url.pathname, body)) { response.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Invalid or stale bridge signature' })); return; }
    const requestId = String(request.headers['x-wwh-request-id'] ?? ''); const now = Date.now();
    for (const [id, expires] of seen) if (expires < now) seen.delete(id);
    if (requestId && seen.has(requestId)) { response.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ accepted: true, duplicate: true })); return; }
    if (requestId) seen.set(requestId, now + 10 * 60_000);
    try {
      const payload = JSON.parse(body) as Record<string, unknown>;
      if (url.pathname === '/announce') {
        const title = String(payload.title ?? '').trim(); const message = String(payload.message ?? '').trim();
        if (!title || !message) throw new Error('title and message are required');
        const messageId = await sync.postAnnouncement(title, message, payload.mentionStaff === true);
        response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ posted: true, messageId })); return;
      }
      const storyId = Number(payload.storyId); if (!Number.isInteger(storyId) || storyId < 1) throw new Error('storyId is required');
      await sync.syncById(storyId); response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ synced: true }));
    } catch (error) { response.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error instanceof Error ? error.message : 'Sync failed' })); }
  });
  server.listen(config.httpPort, config.httpHost);
  return server;
}
