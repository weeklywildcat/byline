import { describe, expect, it, vi } from "vitest";
import { prefetchFullRoute } from "../src/ui/shell/prefetch";

describe("full route prefetch", () => {
  it("asks a Next router for the full dynamic route", () => {
    const prefetch = vi.fn();
    expect(prefetchFullRoute({ prefetch }, "/admin/stories")).toBe(true);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/admin/stories", { kind: "full" });
  });

  it("is a no-op for lightweight router mocks without prefetch", () => {
    expect(prefetchFullRoute({}, "/admin/stories")).toBe(false);
  });
});
