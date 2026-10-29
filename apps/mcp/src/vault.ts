import { DurableObject } from "cloudflare:workers";
import type { Connection, Credential, Env } from "./types";
import { unseal } from "./crypto";
import { WordPress } from "./wordpress";
import { authorizationServer } from "./provider";
/** Auth storage only: no newsroom records, MCP sessions or tool result cache. */
export class ConnectionVault extends DurableObject<Env> {
  async putConnection(connection: Connection): Promise<void> {
    if (await this.ctx.storage.get("connection"))
      throw new Error("Connection already exists");
    await this.ctx.storage.put("connection", connection);
    await this.ctx.storage.setAlarm(Date.now() + 15 * 60 * 1000);
  }
  async readConnection(): Promise<Connection | null> {
    return (await this.ctx.storage.get<Connection>("connection")) ?? null;
  }
  async bindGrant(grantId: string): Promise<boolean> {
    return this.ctx.storage.transaction(async (txn) => {
      const c = await txn.get<Connection>("connection");
      if (!c || c.revoked) return false;
      if (c.grantId && c.grantId !== grantId) return false;
      await txn.put("connection", { ...c, grantId });
      return true;
    });
  }
  async claim(): Promise<boolean> {
    return this.ctx.storage.transaction(async (txn) => {
      if (await txn.get("used")) return false;
      await txn.put("used", true);
      await txn.setAlarm(Date.now() + 15 * 60 * 1000);
      return true;
    });
  }
  async consume(limit: number, windowMs: number): Promise<boolean> {
    const now = Date.now();
    return this.ctx.storage.transaction(async (txn) => {
      const bucket = await txn.get<{ start: number; count: number }>("rate");
      const next =
        !bucket || bucket.start + windowMs <= now
          ? { start: now, count: 1 }
          : { ...bucket, count: bucket.count + 1 };
      if (next.count > limit) return false;
      await txn.put("rate", next);
      await txn.setAlarm(now + windowMs * 2);
      return true;
    });
  }
  async revoke(
    connectionId: string,
  ): Promise<{ revoked: true; credentialRevoked: boolean }> {
    const c = await this.readConnection();
    if (!c) return { revoked: true, credentialRevoked: true };
    // Invalidate every token for this connection before contacting WordPress.
    await this.ctx.storage.put("connection", { ...c, revoked: true });
    let credentialRevoked = false;
    try {
      const credential = await unseal<Credential>(
        this.env,
        connectionId,
        c.sealed,
      );
      const wp = new WordPress(this.env, credential, crypto.randomUUID());
      await wp.request(
        `/wp/v2/users/me/application-passwords/${encodeURIComponent(
          credential.uuid,
        )}`,
        "DELETE",
      );
      credentialRevoked = true;
    } catch (error) {
      // A WordPress 401 means the credential has already been revoked.
      if (
        error &&
        typeof error === "object" &&
        "upstreamStatus" in error &&
        error.upstreamStatus === 401
      )
        credentialRevoked = true;
    }
    if (c.grantId) {
      try {
        await authorizationServer(this.env)
          .getOAuthApi(this.env)
          .revokeGrant(c.grantId, String(c.userId));
      } catch {
        /* denied locally immediately; reconcile on alarm */
      }
    }
    if (credentialRevoked) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
    return { revoked: true, credentialRevoked };
  }
  async alarm(): Promise<void> {
    const c = await this.readConnection();
    if (!c) {
      await this.ctx.storage.deleteAll();
      return;
    }
    // Connection ID is authenticated as AES-GCM associated data and stored separately.
    const id = await this.ctx.storage.get<string>("connectionId");
    if (!id) return;
    try {
      let active = false;
      if (c.grantId) {
        let cursor: string | undefined;
        do {
          const page = await authorizationServer(this.env)
            .getOAuthApi(this.env)
            .listUserGrants(String(c.userId), { limit: 100, cursor });
          if (page.items.some((g) => g.id === c.grantId)) {
            active = true;
            break;
          }
          cursor = page.cursor;
        } while (cursor);
      }
      if (c.revoked || !active) {
        await this.revoke(id);
        return;
      }
    } catch {
      /* outage is not evidence of revocation */
    }
    await this.ctx.storage.setAlarm(Date.now() + 60 * 60 * 1000);
  }
  async initialize(
    connectionId: string,
    connection: Connection,
  ): Promise<void> {
    await this.ctx.storage.put("connectionId", connectionId);
    await this.putConnection(connection);
  }
}
export function vault(env: Env, id: string) {
  return env.CONNECTIONS.get(env.CONNECTIONS.idFromName(id));
}
