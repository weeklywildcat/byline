import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARTICLE_BODY_FORMAT, validateArticleBody, type ArticleBody } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_MEDIA, FIXTURE_REFERENCES } from "@byline/article-body/fixtures";
import { StructuredArticleBody } from "@byline/ui/article-body";

const body = (...nodes: ArticleBody["nodes"]): ArticleBody => ({ format: ARTICLE_BODY_FORMAT, version: 1, media: FIXTURE_MEDIA, references: FIXTURE_REFERENCES, nodes });
const render = (...nodes: ArticleBody["nodes"]) => renderToStaticMarkup(<div className="byline-article-view"><StructuredArticleBody body={body(...nodes)} /></div>);

describe("every block in the final registry renders from the one ArticleBody", () => {
  it("renders the whole torture story, and the body it renders is a valid public body", () => {
    expect(validateArticleBody(FIXTURE_ARTICLE_BODY).ok).toBe(true);
    const html = render(...FIXTURE_ARTICLE_BODY.nodes);
    for (const type of ["photo", "gallery", "portraitText", "video", "audio", "reportedQuote", "pullQuote", "keyFacts", "context", "editorsNote", "marginNote", "expandable", "document", "chartMap", "dataTable", "comparison", "keyNumbers", "annotatedImage", "beforeAfter", "visualChapter", "timeline", "relatedCoverage", "poll", "repositoryInteractive"]) {
      expect(html, type).toContain(`data-block-type="${type}"`);
    }
  });

  it("puts wide and full moments in their frames and leaves reading material in the column", () => {
    expect(render(FIXTURE_BLOCKS.portraitText)).toContain('class="byline-block byline-block-portraitText alignwide"');
    expect(render(FIXTURE_BLOCKS.visualChapter)).toContain('class="byline-block byline-block-visualChapter alignfull"');
    expect(render({ ...FIXTURE_BLOCKS.visualChapter, placement: "wide" })).toContain("alignwide");
    expect(render(FIXTURE_BLOCKS.dataTable)).toContain('class="byline-block byline-block-dataTable"');
    expect(render(FIXTURE_BLOCKS.keyNumbers)).toContain('class="byline-block byline-block-keyNumbers"');
  });
});

describe("Portrait + Text and Visual Chapter", () => {
  it("renders the portrait first with its credit from Media, on the side the writer chose", () => {
    const html = render(FIXTURE_BLOCKS.portraitText);
    expect(html).toContain('data-side="left"');
    expect(html.indexOf("byline-portrait-text-figure")).toBeLessThan(html.indexOf("byline-portrait-text-body"));
    expect(html).toContain("Photo: Maya Torres");
    expect(render({ ...FIXTURE_BLOCKS.portraitText, side: "right" })).toContain('data-side="right"');
  });

  it("makes the chapter heading an H2 with an anchor the story's navigation can use", () => {
    const html = render(FIXTURE_BLOCKS.visualChapter);
    expect(html).toContain('<section class="byline-visual-chapter" id="chapter-blk-chapter" data-align="bottom-left" aria-labelledby="blk-chapter-heading">');
    expect(html).toContain('<h2 id="blk-chapter-heading">What the district can do</h2>');
    expect(html).toContain("Part two");
  });
});

describe("Video and Audio", () => {
  it("embeds the privacy-enhanced player: lazy, no autoplay, no loop, fullscreen allowed, with a watch link", () => {
    const html = render(FIXTURE_BLOCKS.video);
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('loading="lazy"');
    expect(html).toMatch(/allowfullscreen/i);
    expect(html).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(html).toContain("Watch on YouTube");
    expect(html).not.toMatch(/autoplay=|loop=|rel=0|[?&]mute/i);
    expect(html).not.toMatch(/allow="[^"]*autoplay/);
    expect(html).not.toContain("captionsConfirmed");
  });

  it("renders a native audio player with metadata preload and the transcript in a closed <details>", () => {
    const html = render(FIXTURE_BLOCKS.audio);
    expect(html).toContain('<audio controls="" preload="metadata" src="audio.wav">');
    expect(html).not.toMatch(/autoplay/i);
    expect(html).toContain('<details class="byline-audio-transcript"><summary>Transcript</summary>');
    expect(html).not.toContain("<details class=\"byline-audio-transcript\" open");
    expect(html.indexOf("byline-audio-title")).toBeLessThan(html.indexOf("<audio"));
    expect(html.indexOf("<audio")).toBeLessThan(html.indexOf("Transcript"));
    expect(html).toContain("Reporter: How long did the express station take to set up?");
  });
});

describe("explanatory blocks", () => {
  it("labels an Editor's Note 'Editor's note' and nothing else", () => {
    const html = render(FIXTURE_BLOCKS.editorsNote);
    expect(html).toContain('<aside class="byline-editors-note" aria-label="Editor&#x27;s note"><p class="byline-kicker">Editor&#x27;s note</p>');
  });

  it("renders a Margin Note as an aside with an optional heading", () => {
    expect(render(FIXTURE_BLOCKS.marginNote)).toContain('<aside class="byline-margin-note" aria-label="About the survey"><h3 class="byline-kicker">About the survey</h3>');
    expect(render({ ...FIXTURE_BLOCKS.marginNote, heading: undefined })).toContain('aria-label="Margin note"><p>');
  });

  it("renders Expandable as a native, closed <details> with no script", () => {
    const html = render(FIXTURE_BLOCKS.expandable);
    expect(html).toContain('<details class="byline-expandable"><summary><span>How we timed the line</span></summary>');
    expect(html).not.toContain(" open");
    expect(html).not.toContain("<script");
  });
});

describe("Chart / Map", () => {
  it("always prints the title, the summary, the source and a direct provider link for an interactive", () => {
    const html = render(FIXTURE_BLOCKS.chartMap);
    expect(html).toContain('data-mode="embed" data-provider="datawrapper" data-src="https://datawrapper.dwcdn.net/AbCdE/" data-height="standard"');
    expect(html).toContain("Average wait by lunch period");
    expect(html).toContain("Second-lunch students wait an average of 14 minutes");
    expect(html).toContain("Source: Weekly Wildcat timing study");
    expect(html).toContain('href="https://datawrapper.dwcdn.net/AbCdE/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain("byline-visualization-fallback-image");
    expect(html).not.toContain("<iframe");
  });

  it("renders a static graphic as an image with its visible summary, and no embed", () => {
    const html = render({ ...FIXTURE_BLOCKS.chartMap, mode: "static", url: undefined, provider: undefined });
    expect(html).toContain('data-mode="static"');
    expect(html).not.toContain("data-src");
    expect(html).toContain("<img");
    expect(html).toContain("Second-lunch students wait");
  });
});

describe("Data Table", () => {
  it("is a real table: caption, header row, column and row scopes", () => {
    const html = render(FIXTURE_BLOCKS.dataTable);
    expect(html).toContain("<caption><span class=\"byline-data-table-title\">Lunch wait times by period</span>");
    expect(html).toContain('<thead><tr><th scope="col">Period</th><th scope="col">Students</th><th scope="col">Average wait (min)</th></tr></thead>');
    expect(html).toContain('<tr><th scope="row">First lunch</th><td>690</td><td>8</td></tr>');
    expect(html).toContain('role="region" aria-label="Lunch wait times by period" tabindex="0"');
    expect(html).toContain("Source: Greenwood School District");
  });

  it("uses plain cells when the first column does not name the row, and the same table for comparison", () => {
    const plain = render({ ...FIXTURE_BLOCKS.dataTable, rowHeaders: false });
    expect(plain).not.toContain('scope="row"');
    expect(plain).toContain("<td>First lunch</td>");
    expect(render({ ...FIXTURE_BLOCKS.dataTable, presentation: "comparison" })).toContain('data-presentation="comparison"');
  });
});

describe("Comparison and Key Numbers", () => {
  it("keeps left before right, each side with its label, title and passage", () => {
    const html = render(FIXTURE_BLOCKS.comparison);
    expect(html.indexOf('data-side="left"')).toBeLessThan(html.indexOf('data-side="right"'));
    expect(html).toContain("One serving window");
    expect(html).toContain("Proposed");
  });

  it("draws each key number as a term and its figure", () => {
    const html = render(FIXTURE_BLOCKS.keyNumbers);
    expect(html).toContain('data-count="3"');
    expect(html).toContain('<dt>students served in two periods</dt><dd class="byline-key-number-value">1,400</dd><dd class="byline-key-number-context">The kitchen was built for 900.</dd>');
    expect(html).toContain("Source: District data and Weekly Wildcat reporting");
  });
});

describe("Annotated Image and Before / After", () => {
  it("numbers linked markers and lists every note, with no script needed", () => {
    const html = render(FIXTURE_BLOCKS.annotatedImage);
    expect(html).toContain('<a class="byline-annotation-marker" href="#annotation-blk-annotated-m1" style="left:22%;top:48%" aria-label="Note 1: The back of the line">1</a>');
    expect(html).toContain('<ol class="byline-annotations"><li id="annotation-blk-annotated-m1" tabindex="-1"><h3>The back of the line</h3><p>Students here have about 12 minutes left to eat.</p></li>');
    expect(html).toContain("annotation-blk-annotated-m2");
  });

  it("shows both complete photographs under their labels, Before first, and carries the fit and the frame's shape", () => {
    const html = render(FIXTURE_BLOCKS.beforeAfter);
    expect(html).toContain('data-fit="cover"');
    expect(html).toContain("--comparison-aspect:1.5");
    expect(html.indexOf("data-before")).toBeLessThan(html.indexOf("data-after"));
    expect((html.match(/<img/g) ?? []).length).toBe(2);
    expect(render({ ...FIXTURE_BLOCKS.beforeAfter, fit: "contain" })).toContain('data-fit="contain"');
    expect(html).not.toContain('type="range"');
  });
});

describe("Related Coverage, Poll and Repository Interactive", () => {
  it("links each story with facts from the reference table, never from the block", () => {
    const html = render(FIXTURE_BLOCKS.relatedCoverage);
    expect(html).toContain('href="/2025/09/12/news/second-lunch-period/"');
    expect(html).toContain("Greenwood adds a second lunch period");
    expect(html).toContain('<time dateTime="2025-09-12T14:00:00.000Z">Sep 12, 2025</time>');
    expect(html).toContain("byline-related-thumb");
  });

  it("renders nothing for a story, poll or media the table does not hold", () => {
    expect(renderToStaticMarkup(<StructuredArticleBody body={{ ...body(FIXTURE_BLOCKS.relatedCoverage, FIXTURE_BLOCKS.poll), references: undefined }} />)).toBe('<div class="article-body"></div>');
  });

  it("renders an open poll statically, with choices and no voting form", () => {
    const html = render(FIXTURE_BLOCKS.poll);
    expect(html).toContain('data-byline-poll-id="lunch-line"');
    expect(html).toContain("How long do you usually wait for lunch?");
    expect(html).toContain("Online voting is unavailable.");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("byline-poll-results");
  });

  it("renders a closed poll's results only when they were released, and never a count when they were not", () => {
    const poll = FIXTURE_REFERENCES.polls!["601"]!;
    const released = renderToStaticMarkup(<StructuredArticleBody body={{ ...body(FIXTURE_BLOCKS.poll), references: { polls: { "601": { ...poll, votingOpen: false, results: { totalVotes: 10, votes: { "under-5": 6, "5-10": 3, "over-10": 1 } } } } } }} />);
    expect(released).toContain("Under 5 minutes: 60%");
    const withheld = renderToStaticMarkup(<StructuredArticleBody body={{ ...body(FIXTURE_BLOCKS.poll), references: { polls: { "601": { ...poll, votingOpen: false } } } }} />);
    expect(withheld).toContain("Voting is closed.");
  });

  it("draws a repository interactive's title and text alternative, and its fallback only from the host registry", () => {
    const bare = render(FIXTURE_BLOCKS.repositoryInteractive);
    expect(bare).toContain('data-repository-interactive="fixture-lunch-line"');
    expect(bare).toContain("A calculator that shows how a change in period length");
    expect(bare).toContain('<div class="byline-repository-interactive-root" data-interactive-root=""></div>');
    const hosted = renderToStaticMarkup(<StructuredArticleBody body={body(FIXTURE_BLOCKS.repositoryInteractive)} host={{ renderInteractive: (block) => <p>Static fallback for {block.key}</p> }} />);
    expect(hosted).toContain("<p>Static fallback for fixture-lunch-line</p>");
  });
});

describe("footnotes", () => {
  it("numbers superscript references by order and gathers the notes once, at the end, with backlinks", () => {
    const html = render(...FIXTURE_ARTICLE_BODY.nodes);
    expect(html).toContain('<sup class="byline-footnote-ref"><a id="fnref-fn-timing" href="#fn-fn-timing" aria-label="Footnote 1">1</a></sup>');
    expect(html).toContain('<a id="fnref-fn-survey" href="#fn-fn-survey" aria-label="Footnote 2">2</a>');
    expect(html).toContain('<a id="fnref-fn-budget" href="#fn-fn-budget" aria-label="Footnote 3">3</a>');
    expect((html.match(/class="byline-footnotes"/g) ?? []).length).toBe(1);
    expect(html).toContain('<li id="fn-fn-timing"><span>Timed by Weekly Wildcat reporters on Oct. 14; the bell rings at 11:38 a.m.</span> <a class="byline-footnote-back" href="#fnref-fn-timing" aria-label="Back to reference 1">↩</a></li>');
    expect(html.lastIndexOf("byline-footnotes")).toBeGreaterThan(html.indexOf("keep eating on the steps"));
    expect(html).toContain("<ol>");
  });

  it("renumbers when a reference moves", () => {
    const [a, b] = [
      { type: "paragraph" as const, children: [{ type: "footnote" as const, id: "a", text: "A" }] },
      { type: "paragraph" as const, children: [{ type: "footnote" as const, id: "b", text: "B" }] }
    ];
    expect(render(a, b)).toContain('aria-label="Footnote 1">1</a></sup></p><p><sup class="byline-footnote-ref"><a id="fnref-b"');
    expect(render(b, a)).toContain('<a id="fnref-b" href="#fn-b" aria-label="Footnote 1">1</a>');
  });

  it("prints no Footnotes section for a story without any", () => {
    expect(render(FIXTURE_BLOCKS.pullQuote)).not.toContain("byline-footnotes");
  });
});
