import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";
import {
  DEPLOY_PUBLIC_SITE_TASK,
  PUBLIC_DEPLOY_CONCURRENCY_KEY,
  deployHookConfigured,
  deployHookUrl,
  deployPublicSiteTask,
  queuePublicDeployment,
  reconcilePublicDeployment,
  triggerPublicDeployment,
  type DeployPublicSiteInput
} from "../src/public/deployment";

const SHA = "a".repeat(64);
const input: DeployPublicSiteInput = { revision: 49, sha256: SHA, reason: "stories update 12" };
const ENV = { BYLINE_DEPLOY_HOOK_URL: "https://api.example.test/deploy/secret-token" };

function state(revision = 49, sha256 = SHA) {
  return {
    currentRevision: revision,
    completed: {
      revision,
      schemaVersion: 2,
      sha256,
      bytes: 1234,
      generatedAt: "2026-11-08T21:03:56.726Z",
      filename: `snapshot-v2-r${revision}-${sha256}.json`,
      producerVersion: 2
    },
    pointerCorrupt: null,
    updatedAt: "2026-11-08T21:03:56.726Z"
  };
}

describe("public deploy hook configuration", () => {
  it("is optional, HTTPS-only and rejects embedded credentials", () => {
    expect(deployHookConfigured({})).toBe(false);
    expect(deployHookUrl({})).toBeNull();
    expect(() => deployHookUrl({ BYLINE_DEPLOY_HOOK_URL: "http://example.test/hook" })).toThrow(/HTTPS/);
    expect(() => deployHookUrl({ BYLINE_DEPLOY_HOOK_URL: "https://user:pass@example.test/hook" })).toThrow(/embedded credentials/);
    expect(deployHookUrl(ENV)?.toString()).toBe(ENV.BYLINE_DEPLOY_HOOK_URL);
  });

  it("queues only when configured and preserves the snapshot identity", async () => {
    const queue = vi.fn(async () => ({ id: 7 }));
    const payload = { jobs: { queue } } as unknown as Payload;

    expect(await queuePublicDeployment(payload, input, {})).toBeNull();
    expect(queue).not.toHaveBeenCalled();

    await queuePublicDeployment(payload, input, ENV);
    expect(queue).toHaveBeenCalledWith({
      task: DEPLOY_PUBLIC_SITE_TASK,
      queue: "publication",
      input,
      overrideAccess: true
    });
  });

  it("uses one exclusive superseding deploy key and retries independently", () => {
    expect(deployPublicSiteTask.slug).toBe(DEPLOY_PUBLIC_SITE_TASK);
    expect(deployPublicSiteTask.retries).toEqual({ attempts: 3 });
    const concurrency = deployPublicSiteTask.concurrency as { key: () => string; exclusive: boolean; supersedes: boolean };
    expect(concurrency.key()).toBe(PUBLIC_DEPLOY_CONCURRENCY_KEY);
    expect(concurrency).toMatchObject({ exclusive: true, supersedes: true });
  });
});


describe("public deploy reconciliation", () => {
  const job = (patch: Record<string, unknown> = {}) => ({
    id: 10,
    input,
    completedAt: null,
    hasError: false,
    log: [],
    ...patch
  });

  function reconciler(docs: unknown[]) {
    const queue = vi.fn(async () => ({ id: 99 }));
    const find = vi.fn(async () => ({ docs }));
    return { payload: { jobs: { queue }, find } as unknown as Payload, queue, find };
  }

  it("does not duplicate an exact deployment that is still pending", async () => {
    const { payload, queue } = reconciler([job()]);
    await expect(reconcilePublicDeployment(payload, input, ENV)).resolves.toEqual({ outcome: "pending", revision: 49, jobId: 10 });
    expect(queue).not.toHaveBeenCalled();
  });

  it("does not redeploy an exact snapshot already accepted by the provider", async () => {
    const completed = job({
      completedAt: "2026-11-16T18:00:00.000Z",
      log: [{ taskSlug: DEPLOY_PUBLIC_SITE_TASK, state: "succeeded", output: { outcome: "triggered", revision: 49, status: 200 } }]
    });
    const { payload, queue } = reconciler([completed]);
    await expect(reconcilePublicDeployment(payload, input, ENV)).resolves.toEqual({ outcome: "already-triggered", revision: 49, jobId: 10 });
    expect(queue).not.toHaveBeenCalled();
  });

  it("requeues a missing or exhausted deployment for the current snapshot", async () => {
    const failed = job({ completedAt: "2026-11-16T18:00:00.000Z", hasError: true });
    const { payload, queue } = reconciler([failed]);
    await expect(reconcilePublicDeployment(payload, input, ENV)).resolves.toEqual({ outcome: "queued", revision: 49, jobId: 99 });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it("stays disabled when no provider hook is configured", async () => {
    const { payload, queue, find } = reconciler([]);
    await expect(reconcilePublicDeployment(payload, input, {})).resolves.toEqual({ outcome: "disabled", revision: 49 });
    expect(find).not.toHaveBeenCalled();
    expect(queue).not.toHaveBeenCalled();
  });
});

describe("public deploy hook delivery", () => {
  const payload = {} as Payload;
  const readState = async () => state();

  it("posts the promoted revision without exposing the hook in the request body", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const result = await triggerPublicDeployment(payload, input, { env: ENV, fetch: fetcher, readState });

    expect(result).toEqual({ outcome: "triggered", revision: 49, status: 204 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = (fetcher as unknown as { mock: { calls: Array<[URL, RequestInit]> } }).mock.calls[0];
    expect(url.toString()).toBe(ENV.BYLINE_DEPLOY_HOOK_URL);
    expect(init).toMatchObject({ method: "POST", redirect: "manual" });
    expect(init.body).toBeUndefined();
    expect(new Headers(init.headers).get("X-Byline-Expected-Revision")).toBe("49");
    expect(new Headers(init.headers).get("X-Byline-Snapshot-Digest")).toBe(SHA);
    expect(new Headers(init.headers).get("X-Byline-Reason")).toBe(input.reason);
  });

  it("falls back to a safe reason for malformed stored task input", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await triggerPublicDeployment(payload, { ...input, reason: undefined as unknown as string }, { env: ENV, fetch: fetcher, readState });
    const [, init] = (fetcher as unknown as { mock: { calls: Array<[URL, RequestInit]> } }).mock.calls[0];
    expect(new Headers(init.headers).get("X-Byline-Reason")).toBe("public snapshot");
  });

  it("skips an obsolete deploy when a newer public revision exists", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    const result = await triggerPublicDeployment(payload, input, {
      env: ENV,
      fetch: fetcher,
      readState: async () => state(50, "b".repeat(64))
    });
    expect(result).toEqual({ outcome: "stale", revision: 49, status: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a deploy when the advertised digest is not the promoted snapshot", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(triggerPublicDeployment(payload, input, {
      env: ENV,
      fetch: fetcher,
      readState: async () => state(49, "b".repeat(64))
    })).rejects.toThrow(/not the currently promoted snapshot/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails provider and network errors so the Jobs Queue can retry them", async () => {
    const rejected = vi.fn(async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    await expect(triggerPublicDeployment(payload, input, { env: ENV, fetch: rejected, readState })).rejects.toThrow("Deploy hook returned HTTP 503.");

    const broken = vi.fn(async () => { throw new Error("provider connection reset"); }) as unknown as typeof fetch;
    await expect(triggerPublicDeployment(payload, input, { env: ENV, fetch: broken, readState })).rejects.toThrow("Deploy hook request failed.");
  });
});
