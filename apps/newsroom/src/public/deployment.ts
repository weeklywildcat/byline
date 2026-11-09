import type { Payload, TaskConfig } from "payload";
import { readPublicationState } from "../db/publication-state";
import { PUBLICATION_QUEUE } from "./queue";

export const DEPLOY_PUBLIC_SITE_TASK = "deploy-public-site";
export const PUBLIC_DEPLOY_CONCURRENCY_KEY = "public-site-deploy";

export type DeployPublicSiteInput = {
  revision: number;
  sha256: string;
  reason: string;
};

function deployReason(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : "public snapshot";
}

type DeployEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class PublicDeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicDeployError";
  }
}

function deployHookValue(env: DeployEnvironment = process.env) {
  return env.BYLINE_DEPLOY_HOOK_URL?.trim() ?? "";
}

export function deployHookConfigured(env: DeployEnvironment = process.env): boolean {
  return deployHookValue(env).length > 0;
}

/**
 * The deploy hook is a credential-like URL supplied by the deployment
 * environment, never a public publication setting. Only HTTPS endpoints with
 * no embedded basic-auth credentials are accepted.
 */
export function deployHookUrl(env: DeployEnvironment = process.env): URL | null {
  const value = deployHookValue(env);
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PublicDeployError("BYLINE_DEPLOY_HOOK_URL is not a valid URL.");
  }
  if (url.protocol !== "https:") {
    throw new PublicDeployError("BYLINE_DEPLOY_HOOK_URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new PublicDeployError("BYLINE_DEPLOY_HOOK_URL must not contain embedded credentials.");
  }
  return url;
}

/**
 * Queue one public-site deployment after a completed snapshot exists.
 *
 * Every deployment job shares one superseding concurrency key. A newer queued
 * revision therefore replaces an older pending deploy before either can call
 * the provider. A running job also re-checks publication state immediately
 * before sending its request and skips itself when a newer revision won.
 */
export async function queuePublicDeployment(payload: Payload, input: DeployPublicSiteInput, env: DeployEnvironment = process.env) {
  if (!deployHookConfigured(env)) return null;
  const jobs = payload.jobs as unknown as { queue: (args: Record<string, unknown>) => Promise<{ id: number | string }> };
  return jobs.queue({
    task: DEPLOY_PUBLIC_SITE_TASK,
    queue: PUBLICATION_QUEUE,
    input: {
      revision: input.revision,
      sha256: input.sha256,
      reason: deployReason(input.reason)
    } satisfies DeployPublicSiteInput,
    overrideAccess: true
  });
}

export type DeployHookResult =
  | { outcome: "disabled"; revision: number; status: 0 }
  | { outcome: "stale"; revision: number; status: 0 }
  | { outcome: "triggered"; revision: number; status: number };

/**
 * POST the configured deploy hook for exactly the current promoted snapshot.
 *
 * The hook response only acknowledges that the provider accepted a build; the
 * static build still verifies the snapshot revision, bytes and digest before
 * it can deploy. HTTP/network failures throw so Payload's Jobs Queue retry
 * policy owns delivery.
 */
export async function triggerPublicDeployment(
  payload: Payload,
  input: DeployPublicSiteInput,
  options: { env?: DeployEnvironment; fetch?: FetchLike; readState?: typeof readPublicationState } = {}
): Promise<DeployHookResult> {
  const env = options.env ?? process.env;
  const hook = deployHookUrl(env);
  if (!hook) return { outcome: "disabled", revision: input.revision, status: 0 };

  const state = await (options.readState ?? readPublicationState)(payload);
  // A newer public mutation means this deploy is obsolete. Its own snapshot
  // job will queue a newer deployment after promotion.
  if (state.currentRevision !== input.revision) {
    return { outcome: "stale", revision: input.revision, status: 0 };
  }
  const completed = state.completed;
  if (!completed || completed.revision !== input.revision || completed.sha256 !== input.sha256) {
    throw new PublicDeployError(`Revision ${input.revision} is not the currently promoted snapshot.`);
  }

  const fetcher = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetcher(hook, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent": "Byline",
        "X-Byline-Expected-Revision": String(input.revision),
        "X-Byline-Snapshot-Digest": input.sha256,
        "X-Byline-Reason": deployReason(input.reason)
      }
    });
  } catch {
    // Fetch errors can contain the requested URL. Never copy an exception
    // message into a job error because the deploy-hook URL is credential-like.
    throw new PublicDeployError("Deploy hook request failed.");
  }

  await response.body?.cancel().catch(() => undefined);
  if (!response.ok) {
    throw new PublicDeployError(`Deploy hook returned HTTP ${response.status}.`);
  }
  return { outcome: "triggered", revision: input.revision, status: response.status };
}

/**
 * Separate from snapshot preparation so a provider outage never invalidates a
 * good immutable snapshot. The publication worker runs both tasks serially.
 */
export const deployPublicSiteTask: TaskConfig = {
  slug: DEPLOY_PUBLIC_SITE_TASK,
  label: "Deploy public site",
  inputSchema: [
    { name: "revision", type: "number", required: true },
    { name: "sha256", type: "text", required: true },
    { name: "reason", type: "text", required: true }
  ],
  outputSchema: [
    { name: "outcome", type: "text" },
    { name: "revision", type: "number" },
    { name: "status", type: "number" }
  ],
  concurrency: { key: () => PUBLIC_DEPLOY_CONCURRENCY_KEY, exclusive: true, supersedes: true },
  retries: { attempts: 3 },
  handler: async ({ input, req }) => {
    const result = await triggerPublicDeployment(req.payload, input as DeployPublicSiteInput);
    if (result.outcome === "triggered") {
      req.payload.logger.info({ msg: `Public deploy hook accepted revision ${result.revision} (HTTP ${result.status}).` });
    } else if (result.outcome === "stale") {
      req.payload.logger.info({ msg: `Skipped stale public deploy for revision ${result.revision}; a newer public revision exists.` });
    } else {
      req.payload.logger.info({ msg: "Public deploy hook is not configured; snapshot preparation remains enabled." });
    }
    return { output: result };
  }
};
