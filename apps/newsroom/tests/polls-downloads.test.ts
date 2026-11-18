// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "../src/ui/polls/api";

/**
 * Safari starts a plain `<a download>` from its download manager, with no Origin and
 * no Sec-Fetch-Site, so Payload's CSRF check drops the session cookie and the saved
 * "file" is a 401 JSON body. Downloads go through fetch with the cookie instead.
 */
describe("polls downloads", () => {
  afterEach(() => vi.restoreAllMocks());

  const stubDownload = () => {
    const saved: Array<{ name: string; href: string }> = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, href: this.href });
    });
    return saved;
  };

  it("sends the session cookie and saves under the server's filename", async () => {
    const saved = stubDownload();
    const fetchMock = vi.fn(async () => new Response("# Guide", { headers: { "Content-Disposition": 'attachment; filename="wildcat-polls-spreadsheet-guide.md"' } }));
    vi.stubGlobal("fetch", fetchMock);
    await downloadFile("/api/byline/polls/files/wildcat-polls-spreadsheet-guide.md", "fallback.md");
    expect(fetchMock).toHaveBeenCalledWith("/api/byline/polls/files/wildcat-polls-spreadsheet-guide.md", { credentials: "include" });
    expect(saved).toEqual([{ name: "wildcat-polls-spreadsheet-guide.md", href: "blob:test" }]);
  });

  it("uses the fallback name when the server names none", async () => {
    const saved = stubDownload();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("a,b")));
    await downloadFile("/x", "poll-summary.csv");
    expect(saved[0]?.name).toBe("poll-summary.csv");
  });

  it("raises the server's message instead of saving an error body", async () => {
    const saved = stubDownload();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "Sign in to use the newsroom.", data: { status: 401 } }, { status: 401 })));
    await expect(downloadFile("/x", "f.md")).rejects.toMatchObject({ message: "Sign in to use the newsroom.", status: 401 });
    expect(saved).toEqual([]);
  });
});
