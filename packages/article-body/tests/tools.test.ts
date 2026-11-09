import { describe, expect, it } from "vitest";
import {
  boundedParagraphs,
  chartDataProblem,
  chartModel,
  chartValue,
  collectFootnotes,
  collectSources,
  finalizeBlock,
  finalizeSourceRef,
  finalScoreKicker,
  finalScoreProblem,
  finalScoreSentence,
  finalScoreWinner,
  formatTimestamp,
  isBlockingIssue,
  parseSocialPostUrl,
  parseTimestamp,
  safeWebUrl,
  validateArticleBody,
  type ArticleBody,
  type MediaLookup
} from "../src";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_MEDIA, FIXTURE_NATIVE_CHART, FIXTURE_REFERENCES, FIXTURE_TRACKER_KEY } from "../src/fixtures";

const lookup: MediaLookup = (id) => FIXTURE_MEDIA[String(id)];
const refs = { event: (id: number | string) => FIXTURE_REFERENCES.events?.[String(id)] ?? null, tracker: (key: string) => key === FIXTURE_TRACKER_KEY };
const clone = (): ArticleBody & { nodes: any[] } => JSON.parse(JSON.stringify(FIXTURE_ARTICLE_BODY));
const errorsOf = (body: unknown) => {
  const result = validateArticleBody(body);
  return result.ok ? [] : result.errors;
};

describe("Social Post URLs", () => {
  const ok = (input: string) => {
    const result = parseSocialPostUrl(input);
    if (!result.ok) throw new Error(`${input}: ${result.message}`);
    return { provider: result.provider, postId: result.postId, url: result.url, kind: result.kind };
  };
  it("accepts every supported post family and canonicalizes it", () => {
    expect(ok("https://www.instagram.com/p/C0ffEeLunch1/?igsh=abc&utm_source=x")).toEqual({ provider: "instagram", postId: "C0ffEeLunch1", url: "https://www.instagram.com/p/C0ffEeLunch1/", kind: "post" });
    expect(ok("https://instagram.com/wildcats/reel/DAbc_123-x")).toMatchObject({ provider: "instagram", url: "https://www.instagram.com/reel/DAbc_123-x/", kind: "video" });
    expect(ok("https://www.instagram.com/reels/DAbc_123-x/")).toMatchObject({ url: "https://www.instagram.com/reel/DAbc_123-x/" });
    expect(ok("https://www.threads.net/@greenwood.hs/post/C9xYz12AbcD")).toEqual({ provider: "threads", postId: "C9xYz12AbcD", url: "https://www.threads.com/@greenwood.hs/post/C9xYz12AbcD", kind: "post" });
    expect(ok("https://www.facebook.com/GreenwoodSchools/posts/pfbid02AbCdEfGhIjKlMn")).toMatchObject({ provider: "facebook", postId: "pfbid02AbCdEfGhIjKlMn", kind: "post" });
    expect(ok("https://m.facebook.com/GreenwoodSchools/videos/1234567890123/")).toMatchObject({ provider: "facebook", url: "https://www.facebook.com/GreenwoodSchools/videos/1234567890123/", kind: "video" });
    expect(ok("https://www.facebook.com/reel/987654321012345")).toMatchObject({ kind: "video", url: "https://www.facebook.com/reel/987654321012345" });
    expect(ok("https://www.facebook.com/watch/?v=1234567890&ref=sharing")).toMatchObject({ url: "https://www.facebook.com/watch/?v=1234567890" });
    expect(ok("https://www.facebook.com/permalink.php?story_fbid=12345678&id=100064")).toMatchObject({ postId: "12345678" });
    expect(ok("https://www.tiktok.com/@greenwood.hs/video/7301234567890123456?is_from_webapp=1")).toEqual({ provider: "tiktok", postId: "7301234567890123456", url: "https://www.tiktok.com/@greenwood.hs/video/7301234567890123456", kind: "video" });
    expect(ok("https://twitter.com/GreenwoodHS/status/1850000000000000000?s=20")).toEqual({ provider: "x", postId: "1850000000000000000", url: "https://x.com/GreenwoodHS/status/1850000000000000000", kind: "post" });
    expect(ok("https://x.com/i/web/status/1850000000000000001")).toMatchObject({ url: "https://x.com/i/status/1850000000000000001" });
    expect(ok("https://bsky.app/profile/Greenwood.bsky.social/post/3kxyzabcdefgh")).toEqual({ provider: "bluesky", postId: "greenwood.bsky.social/3kxyzabcdefgh", url: "https://bsky.app/profile/greenwood.bsky.social/post/3kxyzabcdefgh", kind: "post" });
    expect(ok("https://bsky.app/profile/did:plc:abcdefghijklmnopqrstuvwx/post/3kxyzabcdefgh")).toMatchObject({ postId: "did:plc:abcdefghijklmnopqrstuvwx/3kxyzabcdefgh" });
  });

  it("rejects YouTube with a pointer to the Video block", () => {
    for (const url of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "https://m.youtube.com/shorts/abc"]) {
      expect(parseSocialPostUrl(url)).toMatchObject({ ok: false, code: "youtube", message: expect.stringContaining("Video") });
    }
  });

  it("rejects profiles, deceptive hosts, short links and anything that is not an https post", () => {
    const code = (input: unknown) => {
      const result = parseSocialPostUrl(input);
      return result.ok ? "ok" : result.code;
    };
    expect(code("")).toBe("empty");
    expect(code("instagram.com/p/abcde")).toBe("not-url");
    expect(code("http://www.instagram.com/p/C0ffEeLunch1/")).toBe("not-https");
    expect(code("javascript:alert(1)")).toBe("not-url");
    expect(code("data:text/html,<script>alert(1)</script>")).toBe("not-url");
    expect(code("https://instagram.com.evil.example/p/C0ffEeLunch1/")).toBe("unsupported");
    expect(code("https://evil-instagram.com/p/C0ffEeLunch1/")).toBe("unsupported");
    expect(code("https://notx.com/a/status/1")).toBe("unsupported");
    expect(code("https://user:pass@x.com/a/status/1")).toBe("unsupported");
    expect(code("https://x.com:8443/a/status/1")).toBe("unsupported");
    expect(code("https://www.instagram.com/greenwood.hs/")).toBe("profile");
    expect(code("https://www.threads.net/@greenwood.hs")).toBe("profile");
    expect(code("https://www.tiktok.com/@greenwood.hs")).toBe("profile");
    expect(code("https://x.com/GreenwoodHS")).toBe("profile");
    expect(code("https://bsky.app/profile/greenwood.bsky.social")).toBe("profile");
    expect(code("https://www.facebook.com/GreenwoodSchools")).toBe("profile");
    expect(code("https://www.instagram.com/stories/greenwood.hs/123/")).toBe("unsupported");
    expect(code("https://vm.tiktok.com/ZMabc/")).toBe("shortlink");
    expect(code("https://fb.watch/abc/")).toBe("shortlink");
    expect(code("https://www.facebook.com/share/p/abcDEF/")).toBe("shortlink");
    expect(code("https://www.example.com/embed?src=https://x.com/a/status/1")).toBe("unsupported");
  });

  it("finalizes to the derived provider and id, whatever the stored block claims", () => {
    const result = finalizeBlock({ type: "socialPost", id: "s", url: " https://twitter.com/a/status/12345?s=1 ", provider: "bluesky", postId: "forged", caption: "  Context.  " }, lookup);
    expect(result.block).toEqual({ type: "socialPost", id: "s", url: "https://x.com/a/status/12345", provider: "x", postId: "12345", caption: "Context." });
    expect(finalizeBlock({ type: "socialPost", id: "s", url: "https://youtu.be/dQw4w9WgXcQ" }, lookup).issues[0]).toMatchObject({ effect: "omitted", code: "social-url" });
  });
});

describe("inline Source references", () => {
  it("number in document order, separately from footnotes", () => {
    expect(collectSources(FIXTURE_ARTICLE_BODY.nodes).map((source) => [source.id, source.number])).toEqual([["src-survey", 1], ["src-budget", 2]]);
    expect(collectFootnotes(FIXTURE_ARTICLE_BODY.nodes).map((note) => note.number)).toEqual([1, 2, 3]);
    const moved = clone();
    const budget = moved.nodes.findIndex((node) => node.type === "paragraph" && node.children.some((child: any) => child.id === "src-budget"));
    moved.nodes.unshift(moved.nodes.splice(budget, 1)[0]);
    expect(collectSources(moved.nodes).map((source) => source.id)).toEqual(["src-budget", "src-survey"]);
  });

  it("needs a target and a label, and keeps only safe web addresses", () => {
    expect(finalizeSourceRef({ type: "source", id: "a", kind: "web", url: "javascript:alert(1)", label: "x" }, lookup)).toMatchObject({ ref: null });
    expect(finalizeSourceRef({ type: "source", id: "a", kind: "web", url: "https://example.org/a", label: " " }, lookup)).toMatchObject({ ref: null });
    expect(finalizeSourceRef({ type: "source", id: "a", kind: "document", media: 101, label: "Not a PDF" }, lookup).ref).toBeNull();
    expect(finalizeSourceRef({ type: "source", id: "a", kind: "document", media: 201, page: 0, label: " Budget " }, lookup).ref).toEqual({ type: "source", id: "a", kind: "document", media: 201, label: "Budget" });
  });

  it("are validated: a document source's PDF must be in the media table, ids unique, never inside a block", () => {
    const body = clone();
    delete body.media["201"];
    body.nodes = body.nodes.filter((node) => !["document", "timeline"].includes(node.type));
    expect(errorsOf(body)).toEqual(expect.arrayContaining([expect.stringContaining("source: Media 201 is not in the media table")]));
    const duplicate = clone();
    duplicate.nodes[0].children.push({ type: "source", id: "src-survey", kind: "web", url: "https://example.org/", label: "Again" });
    expect(errorsOf(duplicate)).toEqual(expect.arrayContaining(["body.nodes: two sources share an id"]));
    const inBlock = clone();
    inBlock.nodes.find((node) => node.type === "context").body[0].children.push({ type: "source", id: "z", kind: "web", url: "https://example.org/", label: "x" });
    expect(errorsOf(inBlock).join("\n")).toContain("sources belong in the story's own paragraphs");
  });
});

describe("Context: bounded formatting", () => {
  it("reads old plain text and keeps only bold, italic and safe links", () => {
    expect(boundedParagraphs("One.\n\nTwo.", 100)).toHaveLength(2);
    const body = boundedParagraphs([{ type: "paragraph", children: [
      { type: "text", text: "Bold", bold: true, color: "red" },
      { type: "link", href: "javascript:alert(1)", children: [{ type: "text", text: " unsafe" }] },
      { type: "link", href: "https://example.org/", children: [{ type: "text", text: " safe", italic: true }] },
      { type: "html", html: "<b>x</b>" },
      { type: "footnote", id: "f", text: "no" }
    ] }], 100);
    expect(body).toEqual([{ type: "paragraph", children: [{ type: "text", text: "Bold", bold: true }, { type: "text", text: " unsafe" }, { type: "link", href: "https://example.org/", children: [{ type: "text", text: " safe", italic: true }] }] }]);
    expect(boundedParagraphs([{ type: "paragraph", children: [{ type: "text", text: "x".repeat(50) }] }], 10)[0]?.children[0]).toEqual({ type: "text", text: "x".repeat(10) });
  });
});

describe("Document pages and Reported Quote sources", () => {
  it("keeps a page's excerpt and a quote's safe public source", () => {
    expect(finalizeBlock(FIXTURE_BLOCKS.document, lookup).block).toEqual(FIXTURE_BLOCKS.document);
    const quote = finalizeBlock({ ...FIXTURE_BLOCKS.reportedQuote, sourceUrl: "ftp://example.org/x" }, lookup);
    expect(quote.block).not.toHaveProperty("sourceUrl");
    expect(quote.issues.map((issue) => [issue.code, isBlockingIssue(issue)])).toEqual([["quote-source-invalid", true]]);
    expect(safeWebUrl(" https://example.org/a b ")).toBe("https://example.org/a%20b");
    expect(safeWebUrl("mailto:a@example.org")).toBeNull();
  });
});

describe("Timeline evidence", () => {
  it("publishes an event's photo, link and document, and reports what it cannot", () => {
    expect(finalizeBlock(FIXTURE_BLOCKS.timeline, lookup).block).toEqual(FIXTURE_BLOCKS.timeline);
    const broken = { ...FIXTURE_BLOCKS.timeline, items: FIXTURE_BLOCKS.timeline.items.map((event, index) => (index === 0 ? { ...event, image: { media: 201 }, link: { url: "nope" }, document: { media: 101 } } : event)) };
    const result = finalizeBlock(broken, lookup);
    expect(result.block?.type === "timeline" && result.block.items[0]).toEqual({ id: "t1", label: "Aug. 2025", title: "Enrollment passes 1,400", body: "Greenwood opens the school year with its largest enrollment since the building opened.", current: false });
    expect(result.issues.map((issue) => issue.code)).toEqual(["timeline-photo-unavailable", "timeline-link-invalid", "timeline-document-unavailable"]);
  });
});

describe("chapters", () => {
  it("reads and writes reporter times", () => {
    expect(parseTimestamp("1:24")).toBe(84);
    expect(parseTimestamp("01:02:03")).toBe(3723);
    expect(parseTimestamp("84")).toBe(84);
    expect(parseTimestamp("1:75")).toBeNull();
    expect(parseTimestamp("a")).toBeNull();
    expect(formatTimestamp(84)).toBe("1:24");
    expect(formatTimestamp(3723)).toBe("1:02:03");
  });
  it("sorts chapters, drops half-written ones and keeps the transcript rule", () => {
    const audio = finalizeBlock({ ...FIXTURE_BLOCKS.audio, chapters: [{ id: "b", time: 42, label: "Second" }, { id: "a", time: 0, label: "First" }, { id: "c", time: 10, label: " " }] }, lookup);
    expect(audio.block?.type === "audio" && audio.block.chapters).toEqual([{ id: "a", time: 0, label: "First" }, { id: "b", time: 42, label: "Second" }]);
    expect(audio.issues.map((issue) => issue.code)).toEqual(["chapter-incomplete"]);
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.audio, transcript: "" }, lookup).issues[0]?.code).toBe("audio-transcript");
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.video, captionsConfirmed: true }, lookup).block).toEqual(FIXTURE_BLOCKS.video);
  });
});

describe("native charts", () => {
  it("reads numbers as typed and draws on a shared scale from zero", () => {
    expect([chartValue("1,400"), chartValue("$48,000"), chartValue("14%"), chartValue("(3)"), chartValue("−2"), chartValue(""), chartValue("n/a")]).toEqual([1400, 48000, 14, -3, -2, null, Number.NaN]);
    const model = chartModel(FIXTURE_NATIVE_CHART.data!);
    expect(model.series.map((series) => series.label)).toEqual(["First lunch", "Second lunch"]);
    expect(model.min).toBe(0);
    expect(model.max).toBeGreaterThanOrEqual(16);
    expect(finalizeBlock(FIXTURE_NATIVE_CHART, lookup).block).toEqual(FIXTURE_NATIVE_CHART);
  });
  it("explains bad data in the reporter's words", () => {
    const data = FIXTURE_NATIVE_CHART.data!;
    expect(chartDataProblem({ ...data, rows: data.rows.map((row, index) => (index === 1 ? { ...row, cells: ["Tuesday", "eight", "14"] } : row)) })).toBe("Row 2, “First lunch” is not a number.");
    expect(chartDataProblem({ ...data, rows: data.rows.slice(0, 1) })).toBe("A chart needs at least 2 rows of data.");
    expect(chartDataProblem({ columns: [...data.columns, { id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], rows: data.rows })).toContain("at most 4");
    expect(finalizeBlock({ ...FIXTURE_NATIVE_CHART, source: "" }, lookup).issues[0]?.code).toBe("chart-source");
    expect(finalizeBlock({ ...FIXTURE_NATIVE_CHART, summary: "" }, lookup).issues[0]?.code).toBe("chart-summary");
  });
});

describe("Final Score", () => {
  const score = FIXTURE_BLOCKS.finalScore;
  it("derives the winner and never stores one", () => {
    expect(finalScoreWinner(score)).toBe("a");
    expect(finalScoreWinner({ ...score, teamAScore: 0, teamBScore: 7 })).toBe("b");
    expect(finalScoreWinner({ ...score, status: "tie", teamAScore: 21, teamBScore: 21 })).toBeNull();
    expect(finalScoreWinner({ ...score, status: "forfeit", teamAScore: null, teamBScore: null })).toBeNull();
    expect(finalScoreSentence(score)).toBe("Final score (Football): Greenwood 42, Abbeville 14.");
    expect(finalScoreKicker({ status: "overtime", sport: "Football" })).toBe("Final · OT · Football");
    expect(finalScoreKicker({ status: "tie" })).toBe("Tie");
  });
  it("publishes only a coherent result", () => {
    expect(finalScoreProblem({ ...score, teamAScore: null })).toBe("Type both scores.");
    expect(finalScoreProblem({ ...score, status: "tie" })).toContain("equal scores");
    expect(finalScoreProblem({ ...score, teamBScore: 42 })).toContain("Choose Tie");
    expect(finalScoreProblem({ ...score, status: "overtime", teamBScore: 42 })).toContain("Choose Tie");
    expect(finalScoreProblem({ ...score, status: "forfeit", teamAScore: null, teamBScore: null })).toBeNull();
    expect(finalScoreProblem({ ...score, status: "forfeit", teamAScore: 1, teamBScore: null })).toContain("neither");
    expect(finalScoreProblem({ ...score, teamA: " " })).toBe("Name both teams.");
    expect(finalizeBlock({ ...score, teamAScore: 0, teamBScore: 3 }, lookup).block).toMatchObject({ teamAScore: 0, teamBScore: 3 });
    expect(finalizeBlock({ ...score, teamAScore: 1000 }, lookup).issues[0]?.code).toBe("score-incomplete");
    expect(finalizeBlock({ ...score, date: "2025-02-30" }, lookup).issues.map((issue) => [issue.code, isBlockingIssue(issue)])).toEqual([["score-date-invalid", true]]);
  });
  it("has no sports authority behind it: only typed text and numbers", () => {
    expect(Object.keys(score).sort()).toEqual(["date", "id", "location", "note", "sport", "status", "teamA", "teamAScore", "teamB", "teamBScore", "type"]);
  });
});

describe("Event and Repository Tracker", () => {
  it("publishes only a published Event and a registered tracker", () => {
    expect(finalizeBlock(FIXTURE_BLOCKS.event, lookup, refs).block).toEqual(FIXTURE_BLOCKS.event);
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.event, event: 999 }, lookup, refs).issues[0]).toMatchObject({ effect: "omitted", code: "event-unavailable" });
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.event, event: null }, lookup, refs).issues[0]?.code).toBe("event-missing");
    expect(finalizeBlock(FIXTURE_BLOCKS.repositoryTracker, lookup, refs).block).toEqual(FIXTURE_BLOCKS.repositoryTracker);
    expect(finalizeBlock({ ...FIXTURE_BLOCKS.repositoryTracker, key: "gone" }, lookup, refs).issues[0]?.code).toBe("tracker-unregistered");
  });
  it("validates the Event reference table", () => {
    const body = clone();
    delete body.references!.events;
    expect(errorsOf(body)).toEqual(expect.arrayContaining(["event: Event 701 is not in the reference table"]));
    const unsafe = clone();
    unsafe.references!.events!["701"]!.externalUrl = "javascript:alert(1)";
    expect(errorsOf(unsafe).join()).toContain("externalUrl");
    const forged = clone();
    forged.nodes.find((node) => node.type === "socialPost").url = "https://www.instagram.com/p/C0ffEeLunch1/?x=1";
    expect(errorsOf(forged).join()).toContain("not a canonical supported post address");
  });
});
