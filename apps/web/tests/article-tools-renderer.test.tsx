import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ARTICLE_BODY_FORMAT, type ArticleBody } from "@byline/article-body";
import { FIXTURE_ARTICLE_BODY, FIXTURE_BLOCKS, FIXTURE_MEDIA, FIXTURE_NATIVE_CHART, FIXTURE_REFERENCES } from "@byline/article-body/fixtures";
import { StructuredArticleBody, formatEventWhen, type ArticleRenderHost } from "@byline/ui/article-body";
import { renderRepositoryTracker, repositoryTrackerRegistry } from "@byline/story-presentations/trackers";

const render = (body: ArticleBody, host: ArticleRenderHost = {}) => renderToStaticMarkup(<div className="byline-article-view"><StructuredArticleBody body={body} host={host} /></div>);
const only = (node: ArticleBody["nodes"][number]): ArticleBody => ({ format: ARTICLE_BODY_FORMAT, version: 1, media: FIXTURE_MEDIA, references: FIXTURE_REFERENCES, nodes: [node] });

describe("Photo Gallery layouts", () => {
  it("draws a Photo Essay as whole photographs in sequence, each with its caption", () => {
    const html = render(only({ ...FIXTURE_BLOCKS.gallery, layout: "essay", fit: "crop" }));
    expect(html).toContain('<div class="byline-gallery is-essay" data-layout="essay">');
    expect(html).not.toContain("is-cropped");
    expect(html.match(/sizes="\(min-width: 1080px\) 1040px, 100vw"/g)).toHaveLength(2);
  });
  it("leads a Featured gallery with its first photograph", () => {
    const html = render(only({ ...FIXTURE_BLOCKS.gallery, layout: "featured" }));
    expect(html).toContain('<div class="byline-gallery is-featured" data-layout="featured">');
    expect(html.match(/sizes="([^"]+)"/g)).toEqual(['sizes="(min-width: 1080px) 1040px, 100vw"', 'sizes="(min-width: 1080px) 520px, 100vw"']);
  });
});

describe("Context, Key Facts, timeline evidence and chapters", () => {
  it("keeps Context's bold, italic and links", () => {
    const html = render(only(FIXTURE_BLOCKS.context));
    expect(html).toContain("<strong>less than 20 minutes</strong>");
    expect(html).toContain('<a href="https://example.org/school-meal-time-study"><em>Harvard study</em></a>');
  });
  it("marks compact Key Facts for the container query, and standard ones not at all", () => {
    expect(render(only({ ...FIXTURE_BLOCKS.keyFacts, presentation: "compact" }))).toContain('<aside class="byline-key-facts" data-presentation="compact"');
    expect(render(only(FIXTURE_BLOCKS.keyFacts))).not.toContain("data-presentation");
  });
  it("prints an event's photo, link and document page as ordinary, script-free content", () => {
    const html = render(only(FIXTURE_BLOCKS.timeline));
    expect(html).toContain('<a href="https://example.org/greenwood-lunch-survey" rel="noopener">Survey results</a>');
    expect(html).toContain('<a href="document.pdf#page=9">district-nutrition-services-budget-2026.pdf, page 9</a>');
    expect(html).toContain('class="byline-timeline-item has-media"');
    expect(html).toContain("The express station window on its first day.");
  });
  it("gives audio and video chapters as ordinary timestamp links", () => {
    const audio = render(only(FIXTURE_BLOCKS.audio));
    expect(audio).toContain('<a href="audio.wav#t=42" data-byline-seek="42"><span class="byline-chapter-time">0:42</span><span class="byline-chapter-label">Finding a second window</span></a>');
    const video = render(only(FIXTURE_BLOCKS.video));
    expect(video).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ&amp;t=84s" data-byline-seek="84"');
    expect(video).toContain('<details class="byline-audio-transcript byline-video-transcript"><summary>Transcript</summary>');
    expect(video).not.toContain("autoplay");
  });
});

describe("native charts", () => {
  it("are complete without script: an SVG/HTML chart named by its title and summary, and the data in a native disclosure", () => {
    const html = render(only(FIXTURE_NATIVE_CHART));
    expect(html).toContain('<figure class="byline-visualization" data-mode="native">');
    expect(html).toContain('role="img" aria-roledescription="bar chart" aria-labelledby="blk-native-chart-title blk-native-chart-summary"');
    expect(html.match(/class="byline-chart-bar"/g)).toHaveLength(10);
    expect(html).toContain('<span class="byline-chart-value">16</span>');
    expect(html).toContain('<details class="byline-chart-data"><summary>Show the data</summary>');
    expect(html).toContain('<th scope="row">Friday</th><td>8</td><td>16</td>');
    expect(html).not.toMatch(/<script|<iframe/);
  });
  it("draws lines with shapes and patterns, never colour alone", () => {
    const html = render(only({ ...FIXTURE_NATIVE_CHART, chartType: "line" }));
    expect(html).toContain('<polyline class="byline-chart-line" data-series="1"');
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('class="byline-chart-end-label" data-series="1"');
    expect(render(only({ ...FIXTURE_NATIVE_CHART, chartType: "dot" }))).toContain('class="byline-chart-dot" data-series="0"');
  });
});

describe("Event, Social Post, Final Score and Repository Tracker", () => {
  it("draws an Event in the publication's timezone, and says plainly when it is canceled", () => {
    const html = render(only(FIXTURE_BLOCKS.event), { timeZone: "America/New_York" });
    expect(html).toContain('<aside class="byline-event" data-status="scheduled" aria-labelledby="blk-event-heading"><p class="byline-kicker">Event · Meeting</p>');
    expect(html).toContain("Wednesday, Jan 14, 2026, 6–8 p.m.");
    expect(formatEventWhen({ startAt: "2026-11-13T05:00:00.000Z", allDay: true }, "America/New_York")).toBe("Friday, Nov 13, 2026");
    const canceled = render({ ...only(FIXTURE_BLOCKS.event), references: { events: { "701": { ...FIXTURE_REFERENCES.events!["701"]!, eventStatus: "canceled" } } } });
    expect(canceled).toContain('<p class="byline-kicker">Canceled</p>');
  });
  it("prints a Social Post as a Byline facade and a permalink, never provider HTML", () => {
    const html = render(only(FIXTURE_BLOCKS.socialPost));
    expect(html).toContain('<figure class="byline-social-post" data-provider="instagram" data-post-id="C0ffEeLunch1" data-url="https://www.instagram.com/p/C0ffEeLunch1/">');
    expect(html).toContain('<a href="https://www.instagram.com/p/C0ffEeLunch1/" rel="noopener noreferrer" referrerPolicy="no-referrer">View the post on Instagram</a>');
    expect(html).not.toMatch(/<iframe|<script|<blockquote class="instagram-media"/);
    expect(render(only(FIXTURE_BLOCKS.socialPost), { preview: true })).toContain("Preview: the post can be loaded on the published story.");
  });
  it("draws a Final Score with the winner in weight only, and the result in one sentence", () => {
    const html = render(only(FIXTURE_BLOCKS.finalScore));
    expect(html).toContain('<section class="byline-final-score" data-status="final" aria-label="Final score (Football): Greenwood 42, Abbeville 14.">');
    expect(html).toContain('<p class="byline-kicker">Final · Football</p>');
    expect(html).toContain('<div class="byline-final-score-row" data-winner="true"><span class="byline-final-score-team">Greenwood</span><span class="byline-final-score-value">42</span></div>');
    expect(html).toContain('<div class="byline-final-score-row"><span class="byline-final-score-team">Abbeville</span><span class="byline-final-score-value">14</span></div>');
    expect(html).toContain("Fri, Oct 17, 2025 · Wildcat Stadium");
    const tie = render(only({ ...FIXTURE_BLOCKS.finalScore, status: "tie", teamBScore: 42 }));
    expect(tie).not.toContain("data-winner");
    expect(render(only({ ...FIXTURE_BLOCKS.finalScore, status: "forfeit", teamAScore: null, teamBScore: null, sport: undefined }))).toContain('<p class="byline-kicker">Forfeit</p>');
  });
  it("renders a registered tracker's own content before any script", () => {
    const registry = repositoryTrackerRegistry({ fixtures: true });
    const html = render(only(FIXTURE_BLOCKS.repositoryTracker), { renderTracker: renderRepositoryTracker(registry) });
    expect(html).toContain('<figure class="byline-repository-tracker" data-repository-tracker="fixture-sidewalk-project">');
    expect(html).toContain("2 of 5 phases done");
    expect(render(only(FIXTURE_BLOCKS.repositoryTracker), { renderTracker: renderRepositoryTracker(repositoryTrackerRegistry()) })).not.toContain("phases done");
  });
});

describe("Sources", () => {
  it("numbers sources apart from footnotes, links each straight to its page or PDF page, with backlinks", () => {
    const html = render(FIXTURE_ARTICLE_BODY);
    expect(html).toContain('<sup class="byline-source-ref"><a id="srcref-src-survey" href="#src-src-survey" aria-label="Source 1: Student council lunch survey results">[1]</a></sup>');
    expect(html).toContain('<sup class="byline-footnote-ref"><a id="fnref-fn-survey" href="#fn-fn-survey" aria-label="Footnote 2">2</a></sup>');
    expect(html).toContain('<section class="byline-sources" aria-labelledby="byline-sources-heading"><h2 id="byline-sources-heading" class="byline-kicker">Sources</h2>');
    expect(html).toContain('<li id="src-src-budget"><a href="document.pdf#page=9">Nutrition Services budget request, 2026</a> <span class="byline-source-detail">PDF, page 9</span>');
    expect(html).toContain('href="#srcref-src-budget" aria-label="Back to source 2 in the story"');
    expect(html.indexOf("byline-sources")).toBeLessThan(html.indexOf("byline-footnotes"));
  });
});
