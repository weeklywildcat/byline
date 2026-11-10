import type { ArticleBody } from "@byline/article-body";
import type { PublicDataSection } from "@byline/data";
import publication from "./weekly-wildcat-publication.json";
import fixtureSection from "./data/public-data.json";

/**
 * A complete Snapshot v3 whose one Story places Byline Data Projects, for the
 * Story-embed tests and the offline-snapshot fixture build
 * (`scripts/generate-data-embed-fixture.mts`). The Data section is the
 * committed Data fixture: project 1 (custom, with client code), 2 (a ranking
 * template) and 3 (a noindex timeline).
 */
export const DATA_EMBED_STORY_HREF = "/2026/11/10/news/where-the-sidewalk-stands/";
/** A second Story that places only a template (no client code), to prove a story without client presentations downloads none. */
export const DATA_EMBED_PLAIN_STORY_HREF = "/2026/11/10/news/how-the-bands-ranked/";
const paragraph = (text: string) => ({ type: "paragraph" as const, children: [{ type: "text" as const, text }] });

export const DATA_EMBED_BLOCKS = [
  { type: "dataProject", id: "embed-sidewalk", project: 1, title: "Where the sidewalk project stands", description: "Two of five phases are done; the crossing at Greenwood High is next." },
  { type: "dataProject", id: "embed-bands", project: 2, title: "How the bands ranked", description: "Every marching band's score from the fall competition." },
  { type: "dataProject", id: "embed-again", project: 1, title: "The same project, a second time", description: "A story may place one project more than once." }
] as const;

/** The noindex timeline template (project 3): headings of its own beneath the embed heading. */
export const DATA_EMBED_TIMELINE = { type: "dataProject", id: "embed-timeline", project: 3, title: "The sidewalk project, by date", description: "Every milestone in order." } as const;

export function dataEmbedBody(nodes: ArticleBody["nodes"] = [...DATA_EMBED_BLOCKS]): ArticleBody {
  return {
    format: "byline-v1", version: 1, media: {},
    nodes: [paragraph("Crews have been working on Main Street since spring."), nodes[0]!, paragraph("Meanwhile, the bands competed."), ...nodes.slice(1), paragraph("That is where things stand.")].filter(Boolean) as ArticleBody["nodes"]
  };
}

export function dataEmbedSnapshot(options: { body?: ArticleBody; data?: PublicDataSection; /** Also include the template-only Story (the browser fixture does). */ plainStory?: boolean } = {}) {
  const section = { key: "section-1", name: "News", href: "/category/news/" };
  const story = {
    id: 9001, slug: "where-the-sidewalk-stands", title: "Where the sidewalk stands", titleHtml: "Where the sidewalk stands", kicker: "", excerptHtml: "Data inside a story.",
    href: DATA_EMBED_STORY_HREF, url: `https://weeklywildcat.com${DATA_EMBED_STORY_HREF}`, publishedAt: "2026-11-10T14:05:00.000Z", modifiedAt: "2026-11-10T14:05:00.000Z",
    body: options.body ?? dataEmbedBody(), image: null, leadCaption: "", section, sections: [section], sectionKeys: [section.key], topics: [], topicKeys: [],
    contributors: [], contributorKeys: [], athleteMeta: [], corrections: [], reportingNote: [], live: null,
    format: "standard", presentation: "standard", immersiveAlignment: "bottom-left", primaryVideo: null, videoMetadata: null, video: null, listed: true
  };
  const plain = {
    ...story, id: 9002, slug: "how-the-bands-ranked", title: "How the bands ranked", titleHtml: "How the bands ranked", href: DATA_EMBED_PLAIN_STORY_HREF,
    url: `https://weeklywildcat.com${DATA_EMBED_PLAIN_STORY_HREF}`, publishedAt: "2026-11-10T13:05:00.000Z", modifiedAt: "2026-11-10T13:05:00.000Z",
    body: { format: "byline-v1" as const, version: 1 as const, media: {}, nodes: [paragraph("The fall competition is over."), { ...DATA_EMBED_BLOCKS[1], id: "plain-bands" }, paragraph("The sidewalk project, by date."), DATA_EMBED_TIMELINE, paragraph("Congratulations to all.")] }
  };
  const datasets = {
    stories: options.plainStory ? [story, plain] : [story], people: [], sections: publication.sections.map((entry, index) => ({ id: index + 1, slug: entry.slug, name: entry.name, description: entry.description, href: `/category/${entry.slug}/` })), topics: [], pages: [], corrections: [],
    collections: [], events: [], polls: [], media: [], redirects: []
  };
  return {
    schemaVersion: 3 as const, revision: 7, generatedAt: "2026-11-10T15:00:00.000Z", publication: { ...publication, revision: 7 }, datasets,
    counts: Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length])),
    data: options.data ?? (fixtureSection as unknown as PublicDataSection)
  };
}
