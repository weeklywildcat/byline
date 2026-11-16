import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { prefetchStoryWorkspace, workspaceKey } from "../../src/workspace/workspace-query";
import type { StoryWorkspace } from "../../src/workspace/workspace-types";

describe("Story workspace prefetch", () => {
  it("reuses one fresh request across repeated intent signals", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const workspace = { story: { id: 42, title: "Warm story" } } as unknown as StoryWorkspace;
    const getWorkspace = vi.fn(async () => workspace);

    await prefetchStoryWorkspace(client, 42, getWorkspace);
    await prefetchStoryWorkspace(client, 42, getWorkspace);

    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(getWorkspace).toHaveBeenCalledWith(42);
    expect(client.getQueryData(workspaceKey(42))).toBe(workspace);
  });

  it("ignores invalid story ids instead of creating useless cache entries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const getWorkspace = vi.fn(async () => ({} as StoryWorkspace));

    await prefetchStoryWorkspace(client, 0, getWorkspace);
    await prefetchStoryWorkspace(client, Number.NaN, getWorkspace);

    expect(getWorkspace).not.toHaveBeenCalled();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
