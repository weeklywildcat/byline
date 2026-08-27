import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CMS_POLL_ACTIVE_ROUTE, CMS_POLL_VOTE_ROUTE, POLL_ACTIVE_ENDPOINT, POLL_VOTE_ENDPOINT } from "@/lib/polls";
import { POLL_VOTED_COOKIE_PREFIX, VOTER_COOKIE_NAME } from "@/lib/voter-cookie";

const CMS = "https://cms.example.test";
const SITE = "https://publication.example.test";

type WorkerHandler = {
  fetch(request: Request, env: Record<string, unknown>): Promise<Response>;
};

/**
 * The Worker memoises the CMS origin it discovers, so every test starts from a
 * fresh module instance.
 */
async function loadWorker(): Promise<WorkerHandler> {
  vi.resetModules();
  const module = await import("@/src/worker.js");
  return module.default as unknown as WorkerHandler;
}

function assetsBinding(publication: unknown = { urls: { cms: CMS } }) {
  return {
    fetch: vi.fn(async (request: Request) => {
      if (new URL(request.url).pathname === "/_byline/publication.json") {
        return new Response(JSON.stringify(publication), { status: 200 });
      }

      return new Response("static asset", { status: 200 });
    })
  };
}

function upstream(body: unknown, init: ResponseInit = {}, cookies: string[] = []) {
  const headers = new Headers({ "Content-Type": "application/json", ...(init.headers as Record<string, string>) });
  cookies.forEach((cookie) => headers.append("Set-Cookie", cookie));

  return new Response(typeof body === "string" ? body : JSON.stringify(body), { ...init, headers });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => upstream({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("poll API proxy routing", () => {
  it("proxies the active poll only to the canonical WordPress poll route", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(
      upstream({ id: "website-coverage", question: "Q", options: [], totalVotes: 0, resultsAvailable: false })
    );

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assetsBinding(),
      BYLINE_CMS_URL: CMS
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${CMS}/wp-json${CMS_POLL_ACTIVE_ROUTE}`);
    expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: "website-coverage" });
  });

  it("proxies a vote, preserving the request body, content type, status, and response body", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(
      upstream({ error: "Already voted.", poll: { id: "p", question: "Q", options: [], totalVotes: 9 } }, { status: 409 })
    );

    const body = JSON.stringify({ pollId: "website-coverage", optionId: "news" });
    const response = await worker.fetch(
      new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body
      }),
      { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS }
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${CMS}/wp-json${CMS_POLL_VOTE_ROUTE}`);
    expect(init.method).toBe("POST");
    expect(init.body).toBe(body);
    expect(init.headers.get("Content-Type")).toBe("application/json");
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: "Already voted." });
  });

  it("marks every poll response no-store", async () => {
    const worker = await loadWorker();
    const env = { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS };

    fetchMock.mockResolvedValueOnce(upstream({ error: "No active poll is available." }, { status: 404 }));
    const active = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), env);
    expect(active.headers.get("Cache-Control")).toBe("no-store");
    expect(active.status).toBe(404);

    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));
    const vote = await worker.fetch(
      new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, { method: "POST", body: "{}" }),
      env
    );
    expect(vote.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not proxy unrelated API paths or poll-adjacent paths", async () => {
    const worker = await loadWorker();
    const assets = assetsBinding();
    const env = { ASSETS: assets, BYLINE_CMS_URL: CMS };

    for (const path of ["/api/polls/results", "/api/polls/active/extra", "/api/deploy", "/api/", "/stories/"]) {
      await worker.fetch(new Request(`${SITE}${path}`), env);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(assets.fetch).toHaveBeenCalledTimes(5);
  });

  it("rejects the wrong method and answers preflight locally", async () => {
    const worker = await loadWorker();
    const env = { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS };

    const wrongMethod = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`, { method: "POST" }), env);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("GET, OPTIONS");

    const preflight = await worker.fetch(new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, { method: "OPTIONS" }), env);
    expect(preflight.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not add permissive CORS headers", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assetsBinding(),
      BYLINE_CMS_URL: CMS
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("poll cookie handling through the proxy", () => {
  it("re-emits poll cookies for the public domain and drops everything else", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(
      upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }, { status: 200 }, [
        `${VOTER_COOKIE_NAME}=abc.def; Max-Age=31536000; Path=/; HttpOnly; Secure; SameSite=Lax`,
        `${POLL_VOTED_COOKIE_PREFIX}p=true; Max-Age=31536000; Path=/; Secure; SameSite=Lax`,
        "wordpress_logged_in_1234=someone; Path=/; HttpOnly",
        "PHPSESSID=abc123; Path=/"
      ])
    );

    const response = await worker.fetch(
      new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, { method: "POST", body: "{}" }),
      { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS }
    );

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);

    const [voter, voted] = cookies;
    expect(voter).toContain(`${VOTER_COOKIE_NAME}=abc.def`);
    expect(voter).toContain("HttpOnly");
    expect(voter).toContain("Secure");
    expect(voter).toContain("SameSite=Lax");
    expect(voter).toContain("Path=/");
    expect(voter).toContain("Max-Age=31536000");

    // The readable marker must stay readable: the widget checks it client-side.
    expect(voted).toContain(`${POLL_VOTED_COOKIE_PREFIX}p=true`);
    expect(voted).not.toContain("HttpOnly");
    expect(voted).toContain("SameSite=Lax");

    expect(cookies.join(" ")).not.toContain("wordpress_logged_in");
    expect(cookies.join(" ")).not.toContain("PHPSESSID");
  });

  it("strips a CMS-scoped Domain attribute so cookies bind to the publication host", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(
      upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }, { status: 200 }, [
        `${VOTER_COOKIE_NAME}=abc.def; Domain=cms.example.test; Path=/wp-json; SameSite=Strict; HttpOnly`
      ])
    );

    const response = await worker.fetch(
      new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, { method: "POST", body: "{}" }),
      { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS }
    );

    const [cookie] = response.headers.getSetCookie();
    expect(cookie.toLowerCase()).not.toContain("domain=");
    expect(cookie).not.toContain("Path=/wp-json");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("SameSite=Strict");
    expect(cookie).toContain("HttpOnly");
  });

  it("forwards only poll cookies and the edge client address upstream", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));

    await worker.fetch(
      new Request(`${SITE}${POLL_VOTE_ENDPOINT}`, {
        method: "POST",
        headers: {
          Cookie: `session=private; ${VOTER_COOKIE_NAME}=abc.def; ${POLL_VOTED_COOKIE_PREFIX}p=true; wordpress_logged_in_1=x`,
          "CF-Connecting-IP": "203.0.113.7",
          "X-Forwarded-For": "198.51.100.9"
        },
        body: "{}"
      }),
      { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS }
    );

    const headers = fetchMock.mock.calls[0][1].headers as Headers;
    expect(headers.get("Cookie")).toBe(`${VOTER_COOKIE_NAME}=abc.def; ${POLL_VOTED_COOKIE_PREFIX}p=true`);
    expect(headers.get("CF-Connecting-IP")).toBe("203.0.113.7");
    // A browser-supplied forwarding header must never be passed on as truth.
    expect(headers.get("X-Forwarded-For")).toBeNull();
  });
});

describe("CMS origin discovery", () => {
  it("reads the CMS origin from the published publication document", async () => {
    const worker = await loadWorker();
    const assets = assetsBinding({ urls: { cms: "https://cms.other-school.test" } });
    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));

    await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), { ASSETS: assets });

    expect(fetchMock.mock.calls[0][0]).toBe(`https://cms.other-school.test/wp-json${CMS_POLL_ACTIVE_ROUTE}`);
    expect(assets.fetch).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit deployment variable over the published document", async () => {
    const worker = await loadWorker();
    const assets = assetsBinding({ urls: { cms: "https://cms.other-school.test" } });
    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));

    await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assets,
      BYLINE_CMS_URL: "https://cms.configured.test/wp-json/"
    });

    expect(fetchMock.mock.calls[0][0]).toBe(`https://cms.configured.test/wp-json${CMS_POLL_ACTIVE_ROUTE}`);
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  it("fails safely when no CMS origin can be resolved", async () => {
    const worker = await loadWorker();
    fetchMock.mockClear();

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assetsBinding({ urls: {} })
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Poll service is unavailable." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("upstream failure", () => {
  it("returns a safe public error when the CMS is unreachable", async () => {
    const worker = await loadWorker();
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED cms.example.test:443"));

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assetsBinding(),
      BYLINE_CMS_URL: CMS
    });

    expect(response.status).toBe(502);
    const body = await response.text();
    expect(body).toBe(JSON.stringify({ error: "Poll service is unavailable." }));
    expect(body).not.toContain("ECONNREFUSED");
    expect(body).not.toContain("cms.example.test");
  });

  it("does not let a non-JSON CMS response through as poll state", async () => {
    const worker = await loadWorker();
    fetchMock.mockResolvedValueOnce(
      new Response("<html><body>503 Service Unavailable</body></html>", {
        status: 503,
        headers: { "Content-Type": "text/html" }
      })
    );

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), {
      ASSETS: assetsBinding(),
      BYLINE_CMS_URL: CMS
    });

    expect(response.status).toBe(502);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Poll service is unavailable." });
  });
});

describe("no database binding", () => {
  it("serves polls with an environment that has no D1 binding at all", async () => {
    const worker = await loadWorker();
    const env = { ASSETS: assetsBinding(), BYLINE_CMS_URL: CMS };
    fetchMock.mockResolvedValueOnce(upstream({ id: "p", question: "Q", options: [], totalVotes: 0 }));

    const response = await worker.fetch(new Request(`${SITE}${POLL_ACTIVE_ENDPOINT}`), env);

    expect(response.status).toBe(200);
    expect(Object.keys(env)).toEqual(["ASSETS", "BYLINE_CMS_URL"]);
  });

  it("contains no SQL, poll table names, or voter hashing", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile(new URL("../src/worker.js", import.meta.url), "utf8");

    for (const forbidden of [
      "SELECT",
      "INSERT",
      "poll_votes",
      "poll_options",
      "POLLS_DB",
      "prepare(",
      "voter_key",
      "crypto.subtle",
      "POLL_COOKIE_SECRET"
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
