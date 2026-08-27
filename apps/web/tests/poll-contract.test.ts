import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CMS_POLL_ACTIVE_ROUTE,
  CMS_POLL_VOTE_ROUTE,
  MIN_RESULTS_VOTES,
  POLL_ACTIVE_ENDPOINT,
  POLL_VOTE_ENDPOINT
} from "@/lib/polls";
import { POLL_VOTED_COOKIE_PREFIX, VOTER_COOKIE_NAME } from "@/lib/voter-cookie";

const workerSource = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const pollWidgetSource = await readFile(new URL("../components/PollWidget.tsx", import.meta.url), "utf8");

async function plugin(file: string) {
  return readFile(new URL(`../../../wordpress-plugin/includes/polls/${file}`, import.meta.url), "utf8");
}

async function exists(url: URL) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * One canonical poll contract. PHP, the Worker, and the React client each hold
 * a piece of it, so these assertions keep the three from drifting apart.
 */
describe("canonical poll API contract", () => {
  it("keeps the same public endpoints in the client and the Worker", () => {
    expect(POLL_ACTIVE_ENDPOINT).toBe("/api/polls/active");
    expect(POLL_VOTE_ENDPOINT).toBe("/api/polls/vote");
    expect(workerSource).toContain(`"${POLL_ACTIVE_ENDPOINT}"`);
    expect(workerSource).toContain(`"${POLL_VOTE_ENDPOINT}"`);
    expect(pollWidgetSource).toContain("POLL_ACTIVE_ENDPOINT");
    expect(pollWidgetSource).toContain("POLL_VOTE_ENDPOINT");
  });

  it("keeps the publication frontend free of any CMS hostname", () => {
    for (const source of [pollWidgetSource, workerSource]) {
      expect(source).not.toContain("weeklywildcat.com");
      expect(source).not.toContain("cms.");
    }
  });

  it("proxies to the WordPress routes the contract names", () => {
    expect(CMS_POLL_ACTIVE_ROUTE).toBe("/byline/v1/polls/active");
    expect(CMS_POLL_VOTE_ROUTE).toBe("/byline/v1/polls/vote");
    expect(workerSource).toContain('const CMS_POLL_API_BASE = "/wp-json/byline/v1"');
    expect(workerSource).toContain("/polls/active`");
    expect(workerSource).toContain("/polls/vote`");
  });

  it("registers exactly those WordPress routes", async () => {
    const rest = await plugin("rest.php");
    expect(rest).toContain("'/polls/active'");
    expect(rest).toContain("'/polls/vote'");
    expect(rest).toContain("BYLINE_REST_NAMESPACE");
    expect(rest).not.toContain("weekly-wildcat/v1");
  });

  it("publishes the documented public poll shape", async () => {
    const model = await plugin("model.php");
    const payload = model.slice(model.indexOf("function byline_poll_public_payload"));
    const returned = payload.slice(payload.indexOf("return ["), payload.indexOf("];", payload.indexOf("return [")));

    for (const key of ["'id'", "'question'", "'options'", "'totalVotes'", "'resultsAvailable'"]) {
      expect(returned).toContain(key);
    }
    expect(returned).not.toContain("voter");
  });

  it("shares one response threshold between WordPress and the client", async () => {
    const postType = await plugin("post-type.php");
    expect(postType).toContain(`const BYLINE_POLL_MIN_RESULTS_VOTES = ${MIN_RESULTS_VOTES};`);
  });

  it("preserves the user-facing poll error messages", async () => {
    const rest = await plugin("rest.php");
    for (const message of [
      "Choose a poll option before voting.",
      "Poll is not open.",
      "That answer does not belong to this poll.",
      "Already voted.",
      "No active poll is available."
    ]) {
      expect(rest).toContain(message);
    }
  });

  it("uses the same public cookie names everywhere", async () => {
    const voter = await plugin("voter.php");
    expect(VOTER_COOKIE_NAME).toBe("ww_voter_id");
    expect(POLL_VOTED_COOKIE_PREFIX).toBe("ww_poll_voted_");
    expect(voter).toContain(`const BYLINE_POLL_VOTER_COOKIE = '${VOTER_COOKIE_NAME}';`);
    expect(voter).toContain(`const BYLINE_POLL_VOTED_COOKIE_PREFIX = '${POLL_VOTED_COOKIE_PREFIX}';`);
    expect(workerSource).toContain(`const VOTER_COOKIE_NAME = "${VOTER_COOKIE_NAME}"`);
    expect(workerSource).toContain(`const POLL_VOTED_COOKIE_PREFIX = "${POLL_VOTED_COOKIE_PREFIX}"`);
  });

  it("keeps the poll signing secret out of the frontend entirely", async () => {
    for (const source of [workerSource, pollWidgetSource, wranglerSource]) {
      expect(source).not.toContain("POLL_COOKIE_SECRET");
      expect(source).not.toContain("VOTER_COOKIE_SECRET");
    }

    const contract = await readFile(new URL("../lib/polls.ts", import.meta.url), "utf8");
    const cookies = await readFile(new URL("../lib/voter-cookie.ts", import.meta.url), "utf8");
    for (const source of [contract, cookies]) {
      expect(source).not.toContain("hash_hmac");
      expect(source).not.toContain("crypto.subtle");
      expect(source).not.toContain("SECRET");
    }
  });
});

describe("Cloudflare D1 is fully retired", () => {
  it("declares no D1 binding", () => {
    expect(wranglerSource).not.toContain("d1_databases");
    expect(wranglerSource).not.toContain("POLLS_DB");
    expect(wranglerSource).not.toContain("migrations_dir");
  });

  it("ships no D1 migration directory", async () => {
    expect(await exists(new URL("../migrations", import.meta.url))).toBe(false);
  });

  it("leaves no D1 helpers in the poll contract module", async () => {
    const contract = await readFile(new URL("../lib/polls.ts", import.meta.url), "utf8");
    for (const forbidden of ["D1Database", "POLLS_DB", "prepare(", "SELECT", "INSERT", "submitPollVote", "getPollDatabase"]) {
      expect(contract).not.toContain(forbidden);
    }
  });
});
