import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { createServer } from "../src/server";
import { tools, type ToolContext } from "../src/catalog";
import { WordPress } from "../src/wordpress";
import type { Env } from "../src/types";
import { BylineError } from "../src/errors";
export const env = {
  PUBLIC_URL: "https://mcp.example.test",
  WORDPRESS_URL: "https://cms.example.test",
  APPLICATION_ID: "cf2276ae-6bbb-4f7e-ae25-1b4929461791",
  ALLOWED_ORIGINS: "",
  ACTIVE_KEY_ID: "v1",
  CREDENTIAL_KEYS: JSON.stringify({ v1: btoa("a".repeat(32)) }),
} as Env;
export function context(
  fetcher: typeof fetch = vi.fn(async () => Response.json({})) as typeof fetch,
  editor = true,
): ToolContext {
  return {
    wp: new WordPress(
      env,
      {
        username: "actor",
        password: "SECRET_APP_PASSWORD",
        userId: 7,
        uuid: crypto.randomUUID(),
      },
      "test-request",
      fetcher,
    ),
    requestId: "test-request",
    access: {
      user: { id: 7, name: "Connected person" },
      timezone: "America/New_York",
      version: "test",
      capabilities: {
        edit_posts: true,
        edit_others_posts: editor,
        publish_posts: editor,
        manage_byline: editor,
        manage_byline_integrations: editor,
        canManagePresets: editor,
        canManageFeedback: editor,
        canTriggerDeployment: editor,
        canReadPolls: editor,
      },
    },
    disconnect: async () => ({ revoked: true, credentialRevoked: true }),
  };
}
const clients: Client[] = [];
const handlers: ReturnType<typeof createMcpHandler>[] = [];
async function connect(ctx: ToolContext) {
  const handler = createMcpHandler(() => createServer(ctx));
  handlers.push(handler);
  const transport = new StreamableHTTPClientTransport(
    new URL("https://mcp.example.test/mcp"),
    { fetch: async (url, init) => handler.fetch(new Request(url, init)) },
  );
  const client = new Client(
    { name: "byline-test", version: "1.0" },
    { versionNegotiation: { mode: { pin: "2026-07-28" } } },
  );
  clients.push(client);
  await client.connect(transport);
  return { client, transport };
}
afterEach(async () => {
  for (const c of clients.splice(0)) await c.close();
  for (const h of handlers.splice(0)) await h.close();
  vi.restoreAllMocks();
});
describe("actual SDK v2 MCP client/server", () => {
  it("negotiates 2026-07-28 and discovers typed tools, resources and prompts", async () => {
    const { client, transport } = await connect(context());
    expect(transport.protocolVersion).toBe("2026-07-28");
    const list = await client.listTools();
    expect(list.tools.length).toBeGreaterThan(60);
    expect(
      list.tools.find((t) => t.name === "story.get")?.outputSchema,
    ).toBeDefined();
    expect(
      list.tools.find((t) => t.name === "article.publish")?.annotations,
    ).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
    expect(
      (await client.listResources()).resources.some(
        (r) => r.uri === "byline://newsroom/today",
      ),
    ).toBe(true);
    expect(
      (await client.listResourceTemplates()).resourceTemplates,
    ).toHaveLength(3);
    expect((await client.listPrompts()).prompts).toHaveLength(1);
  });
  it("returns structured authorized reads and compatibility text", async () => {
    const { client } = await connect(context());
    const result = await client.callTool({
      name: "byline.capabilities",
      arguments: {},
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: { user: { id: 7 } },
      requestId: "test-request",
    });
    expect(result.content).toHaveLength(1);
  });
  it("hides capabilities that cannot apply to the account", async () => {
    const { client } = await connect(context(undefined, false));
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain("article.publish");
    expect(names).not.toContain("deployment.trigger");
    expect(names).toContain("story.update_planning");
  });
  it("turns upstream capability failures into safe structured errors", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ message: "SECRET_APP_PASSWORD" }, { status: 403 }),
    ) as typeof fetch;
    const { client } = await connect(context(fetcher));
    const result = await client.callTool({
      name: "task.get",
      arguments: { taskId: 5 },
    });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      ok: false,
      error: { code: "forbidden", retryable: false },
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_APP_PASSWORD");
  });
  it("rejects unknown fields and invalid publication confirmation before mutation", async () => {
    const fetcher = vi.fn(async () => Response.json({})) as typeof fetch;
    const { client } = await connect(context(fetcher));
    const result = await client.callTool({
      name: "article.publish",
      arguments: {
        storyId: 1,
        expectedVersion: "a".repeat(64),
        confirm: false,
      },
    });
    expect(result.isError).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("returns retryable conflicts without automatic write retries", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { data: { current: { version: "b".repeat(64) } } },
        { status: 409 },
      ),
    ) as typeof fetch;
    const { client } = await connect(context(fetcher));
    const result = await client.callTool({
      name: "task.complete",
      arguments: { taskId: 1, expectedVersion: "a".repeat(64) },
    });
    expect(result.structuredContent).toMatchObject({
      error: {
        code: "conflict",
        retryable: true,
        current: { version: "b".repeat(64) },
      },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
describe("catalog contracts", () => {
  it("has discriminative names, strict schemas, permissions and annotations for every tool", () => {
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) {
      expect(t.name).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.permission).toBeTruthy();
      expect(t.api).toBeTruthy();
      expect(typeof t.destructive).toBe("boolean");
      expect(typeof t.idempotent).toBe("boolean");
      expect(t.output).toBeDefined();
      expect(
        t.input.safeParse({ arbitraryUnexpectedField: true }).success,
      ).toBe(false);
    }
  });
  it("does not expose proxy, generic settings or vote insertion tools", () => {
    expect(tools.map((t) => t.name).join(" ")).not.toMatch(
      /rest_request|call_wordpress|run_action|run_sql|set_option|vote\.create/,
    );
  });
  it("requires bounded explicit bulk lists", () => {
    const t = tools.find((t) => t.name === "stories.move_many")!;
    expect(
      t.input.safeParse({
        items: Array.from({ length: 21 }, (_, i) => ({
          id: i + 1,
          workflow: "reporting",
          expectedRevision: 0,
        })),
      }).success,
    ).toBe(false);
  });
  it("does not allow derived published workflow or ambiguous dates", () => {
    const story = tools.find((t) => t.name === "story.update_planning")!;
    expect(
      story.input.safeParse({
        storyId: 1,
        expectedRevision: 0,
        changes: { status: "published" },
      }).success,
    ).toBe(false);
    const appt = tools.find((t) => t.name === "appointment.schedule")!;
    expect(
      appt.input.safeParse({
        storyId: 1,
        appointmentId: crypto.randomUUID(),
        expectedUpdatedAt: "2026-11-01T00:00:00Z",
        startAt: "tomorrow at 3:30",
      }).success,
    ).toBe(false);
  });
});
