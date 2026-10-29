import { describe, expect, it, vi } from "vitest";
import { seal, unseal } from "../src/crypto";
import { configuration } from "../src/config";
import { WordPress } from "../src/wordpress";
import { safeError } from "../src/errors";
import { collectionDetail, workspace } from "../src/schemas";
import type { Env } from "../src/types";
const env = {
  PUBLIC_URL: "https://mcp.example.test",
  WORDPRESS_URL: "https://cms.example.test",
  APPLICATION_ID: "cf2276ae-6bbb-4f7e-ae25-1b4929461791",
  ALLOWED_ORIGINS: "",
  ACTIVE_KEY_ID: "v1",
  CREDENTIAL_KEYS: JSON.stringify({ v1: btoa("a".repeat(32)) }),
} as Env;
describe("credential/privacy boundaries", () => {
  it("encrypts with randomized AES-GCM and authenticates connection identity", async () => {
    const a = await seal(env, "connection-a", {
      password: "PRIVATE_CREDENTIAL",
    });
    const b = await seal(env, "connection-a", {
      password: "PRIVATE_CREDENTIAL",
    });
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(JSON.stringify(a)).not.toContain("PRIVATE_CREDENTIAL");
    expect(await unseal(env, "connection-a", a)).toEqual({
      password: "PRIVATE_CREDENTIAL",
    });
    await expect(unseal(env, "connection-b", a)).rejects.toThrow();
    await expect(
      unseal(
        {
          ...env,
          CREDENTIAL_KEYS: JSON.stringify({ v1: btoa("b".repeat(32)) }),
        },
        "connection-a",
        a,
      ),
    ).rejects.toThrow();
  });
  it("supports retaining old decryption keys during rotation", async () => {
    const sealed = await seal(env, "id", { ok: true });
    const rotated = {
      ...env,
      ACTIVE_KEY_ID: "v2",
      CREDENTIAL_KEYS: JSON.stringify({
        v1: btoa("a".repeat(32)),
        v2: btoa("b".repeat(32)),
      }),
    };
    expect(await unseal(rotated, "id", sealed)).toEqual({ ok: true });
    expect((await seal(rotated, "id", {})).keyId).toBe("v2");
  });
  it("rejects insecure/credentialed configuration and arbitrary paths", async () => {
    for (const WORDPRESS_URL of [
      "http://cms.example.test",
      "https://user:pass@cms.example.test",
      "https://cms.example.test/?password=x",
    ])
      expect(() => configuration({ ...env, WORDPRESS_URL })).toThrow();
    const wp = new WordPress(
      env,
      {
        username: "actor",
        password: "PRIVATE",
        userId: 7,
        uuid: crypto.randomUUID(),
      },
      "request",
    );
    await expect(wp.request("https://attacker.test")).rejects.toThrow();
    await expect(wp.request("/wp/v2/posts")).rejects.toThrow();
  });
  it("refuses upstream redirects so credentials cannot follow a redirect", async () => {
    const fetcher = vi.fn(async (_url, init) => {
      expect(init?.redirect).toBe("manual");
      throw new TypeError("PRIVATE URL AND PASSWORD");
    }) as typeof fetch;
    const wp = new WordPress(
      env,
      {
        username: "actor",
        password: "PRIVATE",
        userId: 7,
        uuid: crypto.randomUUID(),
      },
      "request",
      fetcher,
    );
    try {
      await wp.request("/byline/v1/editorial/access");
      throw new Error("Should fail");
    } catch (e) {
      expect(JSON.stringify(safeError(e, "request"))).not.toContain("PRIVATE");
      expect(safeError(e, "request").code).toBe("upstream_unavailable");
    }
  });
  it("redacts untrusted exception messages and stack traces", () => {
    const safe = safeError(
      new Error("password=PRIVATE token=SECRET"),
      "request",
    );
    expect(safe).toMatchObject({ code: "internal_error" });
    expect(JSON.stringify(safe)).not.toMatch(/PRIVATE|SECRET|stack/);
  });
});
