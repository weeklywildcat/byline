import { describe, expect, it } from "vitest";
import {
  ARTICLE_BLOCK_FAMILIES,
  ARTICLE_BLOCK_LIMITS as LIMITS,
  ARTICLE_BLOCK_TYPES,
  ARTICLE_BLOCKS,
  PRIVILEGED_BLOCK_TYPES,
  articleOutline,
  blockMediaIds,
  collectFootnotes,
  finalizeBlock,
  inlineText,
  isBlockingIssue,
  isTablePaste,
  missingReferences,
  nextCell,
  parseTsv,
  pasteGrid,
  validateArticleBody,
  visualizationUrl,
  type ArticleBlock,
  type ArticleBody,
  type ArticleBodyNode,
  type MediaLookup,
  type TableData
} from "../src";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_INTERACTIVE_KEY, FIXTURE_MEDIA, FIXTURE_REFERENCES, FIXTURE_TRACKER_KEY } from "../src/fixtures";

const lookup: MediaLookup = (id) => FIXTURE_MEDIA[String(id)];
const refs = { dataProject: (id: number | string) => (String(id) === "1" ? { id } : null), story: (id: number | string) => FIXTURE_REFERENCES.stories?.[String(id)] ?? null, poll: (id: number | string) => FIXTURE_REFERENCES.polls?.[String(id)] ?? null, event: (id: number | string) => FIXTURE_REFERENCES.events?.[String(id)] ?? null, interactive: (key: string) => key === FIXTURE_INTERACTIVE_KEY, tracker: (key: string) => key === FIXTURE_TRACKER_KEY };
const paragraph = (text: string) => ({ type: "paragraph" as const, children: [{ type: "text" as const, text }] });
const finalize = (block: ArticleBlock) => finalizeBlock(block, lookup, refs);
const codes = (block: ArticleBlock) => finalize(block).issues.map((issue) => `${issue.effect}:${issue.code}`);

describe("the final registry", () => {
  it("has the 29 tools, grouped the way writers look for them", () => {
    expect(ARTICLE_BLOCK_TYPES).toHaveLength(29);
    const groups = ARTICLE_BLOCK_FAMILIES.map((family) => [family.label, ARTICLE_BLOCK_TYPES.filter((type) => ARTICLE_BLOCKS[type].family === family.id).map((type) => ARTICLE_BLOCKS[type].label)]);
    expect(groups).toEqual([
      ["Media", ["Photo", "Photo Gallery", "Feature Media", "Video", "Audio", "Social Post"]],
      ["Explain", ["Reported Quote", "Pull Quote", "Key Facts", "Context", "Editor's Note", "Margin Note", "Expandable", "Document (PDF)"]],
      ["Data & visual", ["Chart / Map", "Data Table", "Data Project", "Comparison", "Key Numbers", "Final Score", "Annotated Image", "Before / After"]],
      ["Structure & interact", ["Chapter", "Timeline", "Related Coverage", "Event", "Poll", "Repository Interactive", "Repository Tracker"]]
    ]);
  });

  it("marks exactly the editors-only blocks as privileged", () => {
    expect([...PRIVILEGED_BLOCK_TYPES].sort()).toEqual(["editorsNote", "repositoryInteractive", "repositoryTracker"]);
  });

  it("finds tools by reporter language", () => {
    const find = (word: string) => ARTICLE_BLOCK_TYPES.filter((type) => [ARTICLE_BLOCKS[type].label, ...ARTICLE_BLOCKS[type].aliases].some((alias) => alias.toLowerCase().includes(word))).sort();
    expect(find("graph")).toContain("chartMap");
    expect(find("map")).toContain("chartMap");
    expect(find("quote")).toEqual(["pullQuote", "reportedQuote"]);
    expect(find("why it matters")).toEqual(["context"]);
    expect(find("methodology")).toEqual(["expandable"]);
    expect(find("stats")).toContain("keyNumbers");
    expect(find("compare")).toEqual(expect.arrayContaining(["comparison", "beforeAfter"]));
    expect(find("pdf")).toContain("document");
    expect(find("interview")).toContain("audio");
    expect(find("youtube")).toContain("video");
    expect(find("read more")).toEqual(expect.arrayContaining(["relatedCoverage", "expandable"]));
    for (const word of ["election", "dataset", "ranking", "visualization", "results"]) expect(find(word)).toContain("dataProject");
  });

  it("names every Media a block references, in one exhaustive place", () => {
    expect(blockMediaIds(FIXTURE_BLOCKS.photo)).toEqual([101]);
    expect(blockMediaIds(FIXTURE_BLOCKS.portraitText)).toEqual([103]);
    expect(blockMediaIds(FIXTURE_BLOCKS.visualChapter)).toEqual([105]);
    expect(blockMediaIds(FIXTURE_BLOCKS.audio)).toEqual([202]);
    expect(blockMediaIds(FIXTURE_BLOCKS.document)).toEqual([201]);
    expect(blockMediaIds(FIXTURE_BLOCKS.chartMap)).toEqual([108]);
    expect(blockMediaIds(FIXTURE_BLOCKS.annotatedImage)).toEqual([101]);
    expect(blockMediaIds(FIXTURE_BLOCKS.beforeAfter)).toEqual([106, 107]);
    expect(blockMediaIds(FIXTURE_BLOCKS.gallery)).toEqual([103, 104]);
    expect(blockMediaIds(FIXTURE_BLOCKS.video)).toEqual([]);
  });
});

describe("Portrait + Text, Visual Chapter, Video and Audio readiness", () => {
  it("omits a portrait without its photograph or its passage", () => {
    expect(codes({ ...FIXTURE_BLOCKS.portraitText, media: null })).toEqual(["omitted:portrait-missing"]);
    expect(codes({ ...FIXTURE_BLOCKS.portraitText, media: 201 })).toEqual(["omitted:portrait-unavailable"]);
    expect(codes({ ...FIXTURE_BLOCKS.portraitText, body: [] })).toEqual(["omitted:portrait-empty"]);
    expect(finalize({ ...FIXTURE_BLOCKS.portraitText, heading: undefined, caption: undefined }).block).toMatchObject({ side: "left" });
  });

  it("defaults a chapter to full width, bottom left, and needs its heading", () => {
    expect(codes({ ...FIXTURE_BLOCKS.visualChapter, heading: " " })).toEqual(["omitted:chapter-heading"]);
    expect(finalize({ ...FIXTURE_BLOCKS.visualChapter, placement: "column" as never, align: "diagonal" as never }).block).toMatchObject({ placement: "full", align: "bottom-left" });
  });

  it("requires a YouTube id, a title and the editors' captions confirmation, and never publishes the flag", () => {
    const draft = { ...FIXTURE_BLOCKS.video, captionsConfirmed: true };
    expect(codes({ ...draft, videoId: null })).toEqual(["omitted:video-url"]);
    expect(codes({ ...draft, title: "" })).toEqual(["omitted:video-title"]);
    expect(codes({ ...draft, captionsConfirmed: false })).toEqual(["omitted:video-captions"]);
    expect(codes(FIXTURE_BLOCKS.video)).toEqual(["omitted:video-captions"]);
    expect(JSON.stringify(finalize(draft).block)).not.toContain("captionsConfirmed");
  });

  it("requires audio, a title and a transcript", () => {
    expect(codes({ ...FIXTURE_BLOCKS.audio, media: null })).toEqual(["omitted:audio-missing"]);
    expect(codes({ ...FIXTURE_BLOCKS.audio, media: 101 })).toEqual(["omitted:audio-incompatible"]);
    expect(codes({ ...FIXTURE_BLOCKS.audio, title: "" })).toEqual(["omitted:audio-title"]);
    expect(codes({ ...FIXTURE_BLOCKS.audio, transcript: "  " })).toEqual(["omitted:audio-transcript"]);
    expect(finalize({ ...FIXTURE_BLOCKS.audio, transcript: "a".repeat(LIMITS.audioTranscript + 50) }).block).toMatchObject({ transcript: "a".repeat(LIMITS.audioTranscript) });
  });
});

describe("explanatory blocks", () => {
  it("needs text in each note, and a heading on an Expandable", () => {
    expect(codes({ ...FIXTURE_BLOCKS.editorsNote, body: [] })).toEqual(["omitted:note-empty"]);
    expect(codes({ ...FIXTURE_BLOCKS.marginNote, body: [paragraph(" ")] })).toEqual(["omitted:note-empty"]);
    expect(codes({ ...FIXTURE_BLOCKS.expandable, heading: "" })).toEqual(["omitted:expandable-heading"]);
    expect(codes({ ...FIXTURE_BLOCKS.expandable, body: [] })).toEqual(["omitted:expandable-empty"]);
    expect(finalize({ ...FIXTURE_BLOCKS.marginNote, heading: undefined }).block).toMatchObject({ type: "marginNote", heading: undefined });
  });

  it("needs a title and a passage on both sides of a Comparison", () => {
    expect(codes({ ...FIXTURE_BLOCKS.comparison, left: { ...FIXTURE_BLOCKS.comparison.left, title: "" } })).toEqual(["omitted:comparison-side"]);
    expect(codes({ ...FIXTURE_BLOCKS.comparison, right: { ...FIXTURE_BLOCKS.comparison.right, body: [] } })).toEqual(["omitted:comparison-side"]);
    expect(finalize(FIXTURE_BLOCKS.comparison).block).toEqual(FIXTURE_BLOCKS.comparison);
  });

  it("keeps two to four complete numbers", () => {
    const items = [1, 2, 3, 4, 5].map((n) => ({ id: `n${n}`, value: `${n}`, label: `Label ${n}` }));
    expect(finalize({ ...FIXTURE_BLOCKS.keyNumbers, items }).block).toMatchObject({ items: items.slice(0, LIMITS.keyNumbersMax) });
    expect(codes({ ...FIXTURE_BLOCKS.keyNumbers, items: items.slice(0, 1) })).toEqual(["omitted:numbers-too-few"]);
    // A half-written number is reported and left out, and publishing is refused for it.
    const result = finalize({ ...FIXTURE_BLOCKS.keyNumbers, items: [...items.slice(0, 2), { id: "x", value: "9", label: "" }] });
    expect(result.issues).toMatchObject([{ effect: "dropped", code: "number-incomplete", itemId: "x" }]);
    expect(isBlockingIssue(result.issues[0]!)).toBe(true);
  });
});

describe("Chart / Map", () => {
  it("allows only the four providers, and normalizes their addresses", () => {
    expect(visualizationUrl("https://datawrapper.dwcdn.net/AbCdE/")?.provider).toBe("datawrapper");
    expect(visualizationUrl("https://public.flourish.studio/visualisation/1234567/")?.src).toBe("https://flo.uri.sh/visualisation/1234567/embed?auto=1");
    expect(visualizationUrl("https://www.openstreetmap.org/export/embed.html?bbox=1%2C2%2C3%2C4")?.provider).toBe("openstreetmap");
    for (const bad of ["https://evil.example/embed", "http://datawrapper.dwcdn.net/AbCdE/", "javascript:alert(1)", "<iframe src=\"https://datawrapper.dwcdn.net/AbCdE/\"></iframe>", "https://user:pw@datawrapper.dwcdn.net/AbCdE/"]) expect(visualizationUrl(bad), bad).toBeNull();
  });

  it("needs a title and a visible summary, whatever the mode", () => {
    expect(codes({ ...FIXTURE_BLOCKS.chartMap, title: "" })).toEqual(["omitted:chart-title"]);
    expect(codes({ ...FIXTURE_BLOCKS.chartMap, summary: "" })).toEqual(["omitted:chart-summary"]);
  });

  it("refuses an interactive address outside the allowlist", () => {
    expect(codes({ ...FIXTURE_BLOCKS.chartMap, url: "https://evil.example/x" })).toEqual(["omitted:chart-url"]);
    expect(finalize(FIXTURE_BLOCKS.chartMap).block).toMatchObject({ provider: "datawrapper", url: "https://datawrapper.dwcdn.net/AbCdE/" });
  });

  it("requires the image of a static graphic but only encourages a fallback for an interactive one", () => {
    expect(codes({ ...FIXTURE_BLOCKS.chartMap, mode: "static", url: undefined, image: null })).toEqual(["omitted:chart-image"]);
    expect(codes({ ...FIXTURE_BLOCKS.chartMap, image: null })).toEqual([]);
    const gone = finalize({ ...FIXTURE_BLOCKS.chartMap, image: 999 });
    expect(gone.issues).toMatchObject([{ effect: "dropped", code: "chart-fallback-unavailable" }]);
    expect(gone.block).toMatchObject({ image: null });
    expect(isBlockingIssue(gone.issues[0]!)).toBe(true);
  });
});

describe("Data Table", () => {
  const table = FIXTURE_BLOCKS.dataTable;
  it("needs a title, headers on every column and some data", () => {
    expect(codes({ ...table, title: "" })).toEqual(["omitted:table-title"]);
    expect(codes({ ...table, columns: [{ id: "c1", label: "Only" }] })).toEqual(["omitted:table-columns"]);
    expect(codes({ ...table, columns: [...table.columns.slice(0, 2), { id: "c3", label: " " }] })).toEqual(["omitted:table-headers"]);
    expect(codes({ ...table, rows: [{ id: "r1", cells: ["", "", ""] }] })).toEqual(["dropped:table-row-empty", "omitted:table-rows"]);
  });

  it("squares ragged rows and drops empty ones, never blocking on them", () => {
    const result = finalize({ ...table, rows: [{ id: "r1", cells: ["A"] }, { id: "r2", cells: ["", " ", ""] }, ...table.rows] });
    expect(result.block).toMatchObject({ rows: [{ id: "r1", cells: ["A", "", ""] }, ...table.rows] });
    expect(result.issues.map((issue) => issue.code)).toEqual(["table-row-empty"]);
    expect(isBlockingIssue(result.issues[0]!)).toBe(false);
  });

  it("is bounded in columns, rows and cell text", () => {
    const wide = { ...table, columns: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, label: `H${i}` })), rows: Array.from({ length: 60 }, (_, r) => ({ id: `r${r}`, cells: Array.from({ length: 12 }, () => "x".repeat(900)) })) };
    const block = finalize(wide).block as Extract<ArticleBlock, { type: "dataTable" }>;
    expect(block.columns).toHaveLength(LIMITS.tableColumnsMax);
    expect(block.rows).toHaveLength(LIMITS.tableRowsMax);
    expect(block.rows[0]!.cells[0]).toHaveLength(LIMITS.tableCell);
  });

  describe("the TSV paste model", () => {
    const grid: TableData = { columns: [{ id: "a", label: "A" }, { id: "b", label: "B" }], rows: [{ id: "r1", cells: ["1", "2"] }] };
    let counter = 0;
    const ids = () => `new-${++counter}`;

    it("parses what Sheets and Excel copy, including quoted cells", () => {
      expect(parseTsv("a\tb\tc\n1\t2\t3\n")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
      expect(parseTsv('"two\nlines"\t"say ""hi"""\r\nx\ty')).toEqual([["two lines", 'say "hi"'], ["x", "y"]]);
      expect(isTablePaste("just words")).toBe(false);
      expect(isTablePaste("a\tb")).toBe(true);
      expect(isTablePaste("a\n")).toBe(false);
    });

    it("populates the grid from the cell it lands in, adding rows and columns", () => {
      const result = pasteGrid(grid, [["x", "y", "z"], ["p", "q", "r"]], { row: 0, column: 1 }, ids);
      expect(result.columns.map((column) => column.label)).toEqual(["A", "B", "", ""]);
      expect(result.rows.map((row) => row.cells)).toEqual([["1", "x", "y", "z"], ["", "p", "q", "r"]]);
      expect(result.clipped).toBe(false);
    });

    it("clips at the bounds and says so", () => {
      const big = Array.from({ length: 50 }, (_, r) => Array.from({ length: 10 }, (_, c) => `${r}.${c}`));
      const result = pasteGrid(grid, big, { row: 0, column: 0 }, ids);
      expect(result.columns).toHaveLength(LIMITS.tableColumnsMax);
      expect(result.rows).toHaveLength(LIMITS.tableRowsMax);
      expect(result.clipped).toBe(true);
    });

    it("moves between cells with Tab, Shift+Tab and Enter, and stops at the edges", () => {
      const t = { columns: grid.columns, rows: [{ id: "r1", cells: ["1", "2"] }, { id: "r2", cells: ["3", "4"] }] };
      expect(nextCell(t, { row: 0, column: 0 }, "Tab")).toEqual({ row: 0, column: 1 });
      expect(nextCell(t, { row: 0, column: 1 }, "Tab")).toEqual({ row: 1, column: 0 });
      expect(nextCell(t, { row: 1, column: 1 }, "Tab")).toBeNull();
      expect(nextCell(t, { row: 1, column: 0 }, "ShiftTab")).toEqual({ row: 0, column: 1 });
      expect(nextCell(t, { row: -1, column: 0 }, "Enter")).toEqual({ row: 0, column: 0 });
      expect(nextCell(t, { row: 1, column: 0 }, "Enter")).toBeNull();
    });
  });
});

describe("Annotated Image and Before / After", () => {
  it("drops markers with no note, bounds positions and keeps order", () => {
    const markers = [
      { id: "a", x: -5, y: 130, title: "First", body: "" },
      { id: "b", x: 50, y: 50, title: " ", body: " " },
      { id: "c", x: 20.04, y: 80, title: "", body: "Only a body" }
    ];
    const result = finalize({ ...FIXTURE_BLOCKS.annotatedImage, markers });
    expect(result.block).toMatchObject({ markers: [{ id: "a", x: 0, y: 100 }, { id: "c", x: 20, y: 80 }] });
    expect(result.issues).toMatchObject([{ effect: "dropped", code: "marker-empty", itemId: "b" }]);
    expect(codes({ ...FIXTURE_BLOCKS.annotatedImage, markers: [markers[1]!] })).toEqual(["dropped:marker-empty", "omitted:annotated-markers"]);
  });

  it("caps markers at twelve", () => {
    const markers = Array.from({ length: 15 }, (_, i) => ({ id: `m${i}`, x: i, y: i, title: `T${i}`, body: "" }));
    expect((finalize({ ...FIXTURE_BLOCKS.annotatedImage, markers }).block as Extract<ArticleBlock, { type: "annotatedImage" }>).markers).toHaveLength(LIMITS.annotationsMax);
  });

  it("needs both photographs and keeps Before first", () => {
    expect(codes({ ...FIXTURE_BLOCKS.beforeAfter, before: null })).toEqual(["omitted:compare-before"]);
    expect(codes({ ...FIXTURE_BLOCKS.beforeAfter, after: 201 })).toEqual(["omitted:compare-after-unavailable"]);
    const swapped = finalize({ ...FIXTURE_BLOCKS.beforeAfter, before: 107, after: 106, beforeLabel: "", afterLabel: "", fit: "contain" }).block;
    expect(swapped).toMatchObject({ before: 107, after: 106, beforeLabel: "Before", afterLabel: "After", fit: "contain" });
  });
});

describe("Related Coverage, Poll and Repository Interactive", () => {
  it("links only stories the host resolves as published, once each", () => {
    const result = finalize({ ...FIXTURE_BLOCKS.relatedCoverage, stories: [{ id: "a", story: 501 }, { id: "b", story: 501 }, { id: "c", story: 999 }, { id: "d", story: null }] });
    expect(result.block).toMatchObject({ stories: [{ id: "a", story: 501 }] });
    expect(result.issues.map((issue) => issue.code)).toEqual(["related-duplicate", "related-unavailable", "related-empty"]);
    expect(codes({ ...FIXTURE_BLOCKS.relatedCoverage, stories: [{ id: "c", story: 999 }] })).toEqual(["dropped:related-unavailable", "omitted:related-none"]);
  });

  it("holds at most three stories", () => {
    const stories = [501, 502, 501, 502].map((story, i) => ({ id: `s${i}`, story }));
    expect((finalize({ ...FIXTURE_BLOCKS.relatedCoverage, stories }).block as Extract<ArticleBlock, { type: "relatedCoverage" }>).stories).toHaveLength(2);
  });

  it("blocks a poll that is missing or not public", () => {
    expect(codes({ ...FIXTURE_BLOCKS.poll, poll: null })).toEqual(["omitted:poll-missing"]);
    expect(codes({ ...FIXTURE_BLOCKS.poll, poll: 999 })).toEqual(["omitted:poll-unavailable"]);
    expect(codes(FIXTURE_BLOCKS.poll)).toEqual([]);
  });

  it("blocks an interactive whose key is not registered, or that lacks a text alternative", () => {
    expect(codes({ ...FIXTURE_BLOCKS.repositoryInteractive, key: "nope" })).toEqual(["omitted:interactive-unregistered"]);
    expect(codes({ ...FIXTURE_BLOCKS.repositoryInteractive, key: "" })).toEqual(["omitted:interactive-key"]);
    expect(codes({ ...FIXTURE_BLOCKS.repositoryInteractive, description: " " })).toEqual(["omitted:interactive-description"]);
    // With no registry at all, nothing is publishable: a missing key is never a blank frame.
    expect(finalizeBlock(FIXTURE_BLOCKS.repositoryInteractive, lookup).block).toBeNull();
  });
});

describe("blocking issues", () => {
  it("blocks a whole omitted block and substantive drops, not harmless ones", () => {
    expect(isBlockingIssue({ effect: "omitted", code: "anything" })).toBe(true);
    expect(isBlockingIssue({ effect: "dropped", code: "related-unavailable" })).toBe(true);
    expect(isBlockingIssue({ effect: "dropped", code: "marker-empty" })).toBe(false);
    expect(isBlockingIssue({ effect: "dropped", code: "table-row-empty" })).toBe(false);
  });
});

describe("footnotes", () => {
  const note = (id: string, text = id) => ({ type: "footnote" as const, id, text });
  const body = (...nodes: ArticleBodyNode[]) => nodes;

  it("numbers references by reading order, across paragraphs, headings and lists", () => {
    const nodes = body(
      { type: "paragraph", children: [{ type: "text", text: "One" }, note("b")] },
      { type: "heading", level: 2, children: [{ type: "text", text: "H" }, note("a")] },
      { type: "list", ordered: false, items: [{ children: [note("c")] }, { children: [{ type: "text", text: "x" }], list: { type: "list", ordered: false, items: [{ children: [note("d")] }] } }] }
    );
    expect(collectFootnotes(nodes).map((entry) => [entry.id, entry.number])).toEqual([["b", 1], ["a", 2], ["c", 3], ["d", 4]]);
  });

  it("renumbers after an insertion, a reorder and a deletion, keeping stable ids", () => {
    const first = { type: "paragraph" as const, children: [note("one")] };
    const second = { type: "paragraph" as const, children: [note("two")] };
    const inserted = { type: "paragraph" as const, children: [note("new")] };
    expect(collectFootnotes(body(first, second)).map((entry) => entry.id)).toEqual(["one", "two"]);
    expect(collectFootnotes(body(first, inserted, second)).map((entry) => [entry.id, entry.number])).toEqual([["one", 1], ["new", 2], ["two", 3]]);
    expect(collectFootnotes(body(second, first)).map((entry) => [entry.id, entry.number])).toEqual([["two", 1], ["one", 2]]);
    expect(collectFootnotes(body(second)).map((entry) => [entry.id, entry.number])).toEqual([["two", 1]]);
  });

  it("keeps a repeated id once, at its first place, and reads as no text in running prose", () => {
    expect(collectFootnotes(body({ type: "paragraph", children: [note("x"), note("x")] })).map((entry) => entry.number)).toEqual([1]);
    expect(inlineText([{ type: "text", text: "Hello" }, note("x"), { type: "text", text: " world" }])).toBe("Hello world");
  });

  it("lists H2 headings and Visual Chapters, in order, for In This Story", () => {
    const outline = articleOutline(FIXTURE_ARTICLE_BODY.nodes, inlineText);
    expect(outline.map((entry) => [entry.source, entry.text])).toEqual([["heading", "A kitchen built for a smaller school"], ["visualChapter", "What the district can do"]]);
  });
});

describe("the runtime validator", () => {
  const body = FIXTURE_ARTICLE_BODY;
  const mutate = (change: (copy: any) => void): ArticleBody => {
    const copy = JSON.parse(JSON.stringify(body));
    change(copy);
    return copy;
  };
  const errorsOf = (value: unknown) => {
    const result = validateArticleBody(value);
    return result.ok ? [] : result.errors;
  };

  it("accepts the complete fixture, with every block, footnote and reference", () => {
    const result = validateArticleBody(body);
    expect(result.ok ? [] : result.errors).toEqual([]);
    expect(missingReferences(body)).toEqual({ stories: [], polls: [], events: [] });
  });

  it("rejects an unknown block or node type", () => {
    expect(errorsOf(mutate((b) => b.nodes.push({ type: "scrollytelling", id: "x" })))).toEqual(expect.arrayContaining([expect.stringContaining('unknown block type "scrollytelling"')]));
    expect(errorsOf(mutate((b) => b.nodes[0].children.push({ type: "superscript", text: "1" })))).toEqual(expect.arrayContaining([expect.stringContaining('unknown inline node "superscript"')]));
  });

  it("is closed: editor-only and CMS fields are errors, not ignored", () => {
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "video").captionsConfirmed = true; }))).toEqual(expect.arrayContaining([expect.stringContaining("captionsConfirmed: is not allowed here")]));
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "photo").blockName = "Lead"; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "photo").fields = { blockType: "photo" }; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.root = { type: "root", children: [] }; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.media["101"].url = "https://newsroom.example/private"; }))).not.toEqual([]);
  });

  it("rejects bad enums, bounds and shapes", () => {
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "photo").placement = "giant"; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "keyNumbers").items.pop(); b.nodes.find((n: any) => n.type === "keyNumbers").items.pop(); }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "annotatedImage").markers[0].x = 101; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "chartMap").url = "https://evil.example/x"; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "video").videoId = "short"; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "dataTable").columns.length = 1; }))).not.toEqual([]);
    expect(errorsOf(mutate((b) => { b.nodes[0].children[1] = { type: "footnote", id: "", text: "x" }; }))).not.toEqual([]);
    expect(errorsOf({ ...body, version: 2 })).not.toEqual([]);
    expect(errorsOf(null)).not.toEqual([]);
  });

  it("rejects unresolved Media and references, and repeated ids", () => {
    expect(errorsOf(mutate((b) => { delete b.media["201"]; }))).toEqual(expect.arrayContaining([expect.stringContaining("Media 201 is not in the media table")]));
    expect(errorsOf(mutate((b) => { delete b.references.stories["501"]; }))).toEqual(expect.arrayContaining([expect.stringContaining("Story 501")]));
    expect(errorsOf(mutate((b) => { delete b.references.polls["601"]; }))).toEqual(expect.arrayContaining([expect.stringContaining("Poll 601")]));
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "pullQuote").id = "blk-photo"; }))).toEqual(expect.arrayContaining([expect.stringContaining("share an id")]));
    expect(errorsOf(mutate((b) => { b.nodes[1].children.push({ type: "footnote", id: "fn-timing", text: "again" }); }))).toEqual(expect.arrayContaining([expect.stringContaining("two footnotes share an id")]));
  });

  it("refuses footnotes inside a block's paragraphs", () => {
    expect(errorsOf(mutate((b) => { b.nodes.find((n: any) => n.type === "context").body[0].children.push({ type: "footnote", id: "z", text: "no" }); }))).not.toEqual([]);
  });
});
