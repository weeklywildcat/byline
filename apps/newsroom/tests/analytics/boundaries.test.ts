import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMINISTRATION } from "../../src/domain/navigation";
import { AnalyticsIntegration } from "../../src/globals/AnalyticsIntegration";
import { FORBIDDEN_SNAPSHOT_KEYS, assertPublicSafe } from "../../src/public/snapshot/privacy";

/**
 * Where Analytics secrets must never go (docs/google-analytics.md): the browser bundle, the raw admin, Payload's
 * own API and a public snapshot.
 */
const root = path.resolve(__dirname, "../..");
const files = (directory: string): string[] => readdirSync(directory).flatMap((name) => {
  const full = path.join(directory, name);
  return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
});

describe("the browser bundle", () => {
  const client = files(path.join(root, "src/ui"));

  it("imports server Analytics code only as types, and only the vocabulary as values", () => {
    const offenders: string[] = [];
    for (const file of client) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const match = /^import\s+(type\s+)?[^;]*from\s+"(\.[^"]*)";?/.exec(line);
        if (!match || match[1]) continue;
        // `src/analytics/model.ts` is constants and types by design; everything else under src/analytics is server-only.
        const target = path.resolve(path.dirname(file), match[2]!);
        if (target.startsWith(path.join(root, "src/analytics") + path.sep) && target !== path.join(root, "src/analytics/model")) offenders.push(`${path.relative(root, file)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never names a credential or the integration secrets", () => {
    for (const file of client) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/BYLINE_INTEGRATIONS_SECRET|BYLINE_GOOGLE_CLIENT_SECRET|encryptedRefreshToken|refresh_token|process\.env/);
    }
  });

  it("keeps the vocabulary file free of server imports", () => {
    expect(readFileSync(path.join(root, "src/analytics/model.ts"), "utf8")).not.toMatch(/^import\s/m);
  });
});

describe("Payload and the raw admin", () => {
  it("denies the private Global to every request and keeps it out of GraphQL and the admin", () => {
    const access = AnalyticsIntegration.access!;
    for (const operation of [access.read, access.update, access.readVersions]) expect(operation!({ req: { user: { collection: "users", role: "administrator", enabled: true, id: 1 } } } as never)).toBe(false);
    expect(AnalyticsIntegration.graphQL).toBe(false);
    expect(AnalyticsIntegration.admin?.hidden).toBe(true);
    expect(ADMINISTRATION.map((item) => item.path).join(" ")).not.toContain("analytics-integration");
  });

  it("stores the refresh token as an envelope field, never as text", () => {
    const token = AnalyticsIntegration.fields.find((field) => "name" in field && field.name === "encryptedRefreshToken");
    expect(token).toMatchObject({ type: "json" });
    expect(AnalyticsIntegration.fields.some((field) => "name" in field && /^(refreshToken|accessToken|clientSecret)$/.test(field.name))).toBe(false);
  });
});

describe("public snapshots", () => {
  it("rejects every private Analytics field name and the integration secrets", () => {
    for (const key of ["encryptedRefreshToken", "refreshToken", "accessToken", "grantedScopes", "googleAccountEmail", "propertyResource", "accountResource", "streamResource", "propertyId", "trackingMode", "lastErrorCode"]) {
      expect(FORBIDDEN_SNAPSHOT_KEYS.has(key), key).toBe(true);
      const snapshot = { publication: { analytics: { [key]: "x" } } };
      expect(() => assertPublicSafe(snapshot, JSON.stringify(snapshot), {}), key).toThrow(/private newsroom data/);
    }
    const secret = "integration-secret-with-at-least-32-chars!";
    const leaked = { publication: { note: secret } };
    expect(() => assertPublicSafe(leaked, JSON.stringify(leaked), { BYLINE_INTEGRATIONS_SECRET: secret })).toThrow(/integration secret/);
    const client = { publication: { note: "oauth-client-secret-value-123456" } };
    expect(() => assertPublicSafe(client, JSON.stringify(client), { BYLINE_GOOGLE_CLIENT_SECRET: "oauth-client-secret-value-123456" })).toThrow(/integration secret/);
  });

  it("allows exactly what is public: the Measurement ID and tag behavior", () => {
    const snapshot = { publication: { analytics: { provider: "google", measurementId: "G-MAIN12345", installTag: true, consentMode: "ask" } } };
    expect(() => assertPublicSafe(snapshot, JSON.stringify(snapshot), {})).not.toThrow();
  });
});
