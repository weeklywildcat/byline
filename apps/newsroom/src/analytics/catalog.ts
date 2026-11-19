import type { Payload } from "payload";
import { publicStoryPath } from "@byline/content";
import { readPublishedPublication, publicationConfigFromGlobal } from "../public/publication-config";
import { relationId, relationIds } from "../access/user";
import { analyticsCache, cached } from "./cache";
import { buildCatalog, type Catalog } from "./content-map";
import { hostnameOf } from "./admin-client";

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");

/**
 * Published Stories, with the facts the Analytics join needs. Only public facts: a Story that is
 * not published has no analytics and is not read here. Cached briefly because every report uses it.
 */
export async function loadCatalog(payload: Payload, options: { refresh?: boolean } = {}): Promise<Catalog> {
  const { value } = await cached("catalog", 60_000, async () => {
    const [publicationRow, stories, sections, people, topics, redirects] = await Promise.all([
      readPublishedPublication(payload),
      payload.find({ collection: "stories", where: { _status: { equals: "published" } }, depth: 0, pagination: false, overrideAccess: true, select: { headline: true, slug: true, section: true, topics: true, contributors: true, publishedAt: true }, trash: false }),
      payload.find({ collection: "sections", depth: 0, pagination: false, overrideAccess: true, select: { name: true, slug: true } }),
      payload.find({ collection: "people", depth: 0, pagination: false, overrideAccess: true, select: { name: true } }),
      payload.find({ collection: "topics", depth: 0, pagination: false, overrideAccess: true, select: { name: true } }),
      payload.find({ collection: "redirects", depth: 0, pagination: false, overrideAccess: true, select: { from: true, to: true } })
    ]);
    const publication = publicationConfigFromGlobal(publicationRow, 0);
    const sectionById = new Map((sections.docs as Row[]).map((section) => [Number(section.id), { name: text(section.name), slug: text(section.slug) }]));
    const authorNames = new Map((people.docs as Row[]).map((person) => [Number(person.id), text(person.name)]));
    const topicNames = new Map((topics.docs as Row[]).map((topic) => [Number(topic.id), text(topic.name)]));
    const used = { authors: new Set<number>(), topics: new Set<number>(), sections: new Set<string>() };
    const catalog = buildCatalog({
      shortName: publication.identity.shortName,
      siteHost: hostnameOf(publication.urls.publicSite),
      stories: (stories.docs as Row[]).flatMap((story) => {
        const section = sectionById.get(Number(relationId(story.section))) ?? null;
        const publishedAt = text(story.publishedAt) || null;
        if (!publishedAt || !text(story.slug)) return [];
        const authors = relationIds(story.contributors).map(Number);
        const topicIds = relationIds(story.topics).map(Number);
        authors.forEach((id) => used.authors.add(id));
        topicIds.forEach((id) => used.topics.add(id));
        if (section) used.sections.add(section.slug);
        return [{
          id: Number(story.id), title: text(story.headline), section, publishedAt, authors, topics: topicIds,
          path: publicStoryPath({ slug: text(story.slug), sectionSlug: section?.slug ?? "", publishedAt, timeZone: publication.timezone })
        }];
      }),
      redirects: (redirects.docs as Row[]).map((row) => ({ from: text(row.from), to: text(row.to) })),
      sections: [...sectionById.values()].filter((section) => used.sections.has(section.slug)).sort((a, b) => a.name.localeCompare(b.name)),
      authors: [...used.authors].map((id) => ({ id, name: authorNames.get(id) ?? "" })).filter((author) => author.name).sort((a, b) => a.name.localeCompare(b.name)),
      topics: [...used.topics].map((id) => ({ id, name: topicNames.get(id) ?? "" })).filter((topic) => topic.name).sort((a, b) => a.name.localeCompare(b.name))
    });
    return catalog;
  }, { refresh: options.refresh, cache: analyticsCache() });
  return value;
}
