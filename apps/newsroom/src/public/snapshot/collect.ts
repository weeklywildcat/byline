import { isBlockingIssue, type MediaId } from "@byline/article-body";
import {
  collapseRedirects, PUBLIC_SNAPSHOT_SCHEMA_VERSION, publicSnapshotContributor, publicStoryPath, snapshotStoryReference,
  validatePublicBuildSnapshotV2, type PublicBuildSnapshotV2, type PublicStorySnapshot
} from "@byline/content";
import { escapeHtml, type PublicTerm } from "@byline/content/story";
import type { BylinePublicationConfig } from "@byline/core";
import { formatVideoDuration, normalizePrimaryVideo, parseYouTubeVideoId, youTubeEmbedUrl } from "@byline/core";
import { collectMediaIds, collectReferenceIds, normalizePayloadStoryBody, type NormalizeIssue } from "@byline/editor/normalize";
import type { Payload } from "payload";
import { relationIds } from "../../access/user";
import { repositoryInteractivesForServer } from "../../hooks/story-body";
import type { Story } from "../../payload-types";
import { publicationConfigFromGlobal, readPublishedPublication } from "../publication-config";
import { collectCollections, collectCorrections, collectEvents, collectPages, collectPeople, id, iso, prose, publicRead, published, taxonomy, text } from "./datasets";
import { PublicSnapshotError } from "./errors";
import { PreparedMediaCatalog } from "./media";
import { collectLiveCoverage, hasLiveCoverage, readLiveUpdates } from "./live";
import { collectPolls } from "./polls";

type Datasets = PublicBuildSnapshotV2["datasets"];
type StoryFacts = Omit<PublicStorySnapshot, "body">;
const ids = (value: unknown) => [...new Set(relationIds(value).map(Number))];
const term = (row: Datasets["sections"][number], prefix: string): PublicTerm => ({ key: `${prefix}-${row.id}`, name: row.name, href: row.href });

async function readStories(payload: Payload) {
  const { docs } = await payload.find({
    collection: "stories", draft: false, where: published, ...publicRead,
    select: { headline: true, kicker: true, deck: true, section: true, topics: true, contributors: true, featuredMedia: true,
      featuredCaption: true, contentFormat: true, body: true, legacyHtml: true, format: true, video: true, presentation: true,
      immersiveAlignment: true, reportingNote: true, liveCoverage: true, slug: true, publishedAt: true, updatedAt: true, deletedAt: true }
  });
  return docs.filter((row) => !row.deletedAt).sort((a, b) => Date.parse(b.publishedAt ?? "") - Date.parse(a.publishedAt ?? "") || b.id - a.id);
}

function collectStoryFacts(row: Omit<Story, "createdAt">, sectionRow: Datasets["sections"][number], topics: Map<number, Datasets["topics"][number]>, people: Map<number, Datasets["people"][number]>, corrections: StoryFacts["corrections"], publication: BylinePublicationConfig): StoryFacts {
  const title = text(row.headline);
  const href = publicStoryPath({ slug: row.slug, sectionSlug: sectionRow.slug, publishedAt: row.publishedAt, timeZone: publication.timezone });
  if (!href || !row.publishedAt) throw new PublicSnapshotError("invalid-projection", `Story ${row.id} has no canonical public route.`);
  const section = term(sectionRow, "section");
  const storyTopics = ids(row.topics).map((id) => {
    const topic = topics.get(id);
    if (!topic) throw new PublicSnapshotError("invalid-projection", `Story ${row.id} has missing Topic ${id}.`);
    return term(topic, "topic");
  });
  const contributors = ids(row.contributors).map((id) => {
    const person = people.get(id);
    if (!person) throw new PublicSnapshotError("invalid-projection", `Story ${row.id} has missing Person ${id}.`);
    return publicSnapshotContributor(person);
  });
  const videoId = row.format === "video" ? parseYouTubeVideoId(row.video?.url) : null;
  const metadata = row.video?.metadata;
  const videoMetadata = videoId ? normalizePrimaryVideo({ ...(typeof metadata === "object" && metadata && !Array.isArray(metadata) ? metadata : {}), provider: "youtube", videoId }) : null;
  const primaryVideo = videoMetadata ? { videoId: videoMetadata.videoId, embedUrl: youTubeEmbedUrl(videoMetadata.videoId), title: videoMetadata.title || title, duration: formatVideoDuration(videoMetadata.duration) } : null;
  return {
    id: row.id, slug: row.slug, title, titleHtml: escapeHtml(title), kicker: text(row.kicker), excerptHtml: prose(text(row.deck)),
    href, url: publication.urls.publicSite.replace(/\/+$/, "") + href, publishedAt: iso(row.publishedAt), modifiedAt: iso(row.updatedAt),
    section, sections: [section], sectionKeys: [section.key], topics: storyTopics, topicKeys: storyTopics.map((topic) => topic.key),
    contributors, contributorKeys: contributors.flatMap((person) => person.keys), corrections,
    image: id(row.featuredMedia), leadCaption: text(row.featuredCaption), listed: true, athleteMeta: [], format: row.format,
    presentation: row.presentation, immersiveAlignment: row.immersiveAlignment ?? "bottom-left",
    primaryVideo, video: row.format === "video" ? { duration: primaryVideo?.duration ?? null } : null, videoMetadata,
    reportingNote: text(row.reportingNote).split(/\n\s*\n/).filter(Boolean), live: null
  };
}

function contentLosingIssues(issues: NormalizeIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.kind === "unsupported-node") return [`unsupported ${issue.nodeType} at ${issue.path}`];
    if (issue.kind === "unsupported-format") return [`unsupported ${issue.format} formatting at ${issue.path}`];
    if (issue.kind === "unsafe-link") return [`unsafe link at ${issue.path}`];
    if (issue.kind === "block" && isBlockingIssue(issue.issue)) return [`${issue.issue.type} block ${issue.issue.blockId}: ${issue.issue.message}`];
    return [];
  });
}

export async function collectPublicSnapshot(payload: Payload, options: { revision: number; now?: () => Date; asOf?: Date; afterRead?: () => Promise<void> }): Promise<PublicBuildSnapshotV2> {
  const { revision } = options;
  const now = options.now?.() ?? new Date();
  const [publicationRow, sectionRows, topicRows, storyRows, pages, events, redirectRows] = await Promise.all([
    readPublishedPublication(payload), payload.find({ collection: "sections", ...publicRead, sort: "id", select: { name: true, slug: true, description: true, hidden: true } }),
    payload.find({ collection: "topics", ...publicRead, sort: "id", select: { name: true, slug: true, description: true } }),
    readStories(payload), collectPages(payload), collectEvents(payload),
    payload.find({ collection: "redirects", ...publicRead, sort: "id", select: { from: true, to: true } })
  ]);
  const publication = publicationConfigFromGlobal(publicationRow, revision);
  const sections = sectionRows.docs.filter((row) => !row.hidden).map((row) => taxonomy(row, "category"));
  const topics = topicRows.docs.map((row) => taxonomy(row, "tag"));
  const sectionById = new Map(sections.map((row) => [row.id, row]));
  const topicById = new Map(topics.map((row) => [row.id, row]));
  const hiddenSections = new Set(sectionRows.docs.filter((row) => row.hidden).map((row) => row.id));
  const rows = storyRows.filter((row) => !hiddenSections.has(id(row.section) ?? -1));
  const storyIds = rows.map((row) => row.id);
  const pollIds = [...new Set(rows.flatMap((row) => row.contentFormat === "legacy-html" ? [] : collectReferenceIds(row.body).polls.map(Number)))];
  const [people, corrections, collections, polls, liveUpdates] = await Promise.all([
    collectPeople(payload, new Set(rows.flatMap((row) => ids(row.contributors)))),
    collectCorrections(payload, storyIds, options.asOf ?? now),
    collectCollections(payload, new Set(storyIds)),
    collectPolls(payload, pollIds, options.asOf ?? now),
    readLiveUpdates(payload, rows.filter(hasLiveCoverage).map(({ id }) => id))
  ]);
  await options.afterRead?.();
  const personById = new Map(people.map((row) => [row.id, row]));
  const correctionByStory = new Map<number, StoryFacts["corrections"]>();
  for (const { storyId, ...entry } of corrections) {
    const list = correctionByStory.get(storyId) ?? [];
    list.push(entry);
    correctionByStory.set(storyId, list);
  }
  const facts = new Map(rows.map((row) => {
    const section = sectionById.get(id(row.section) ?? -1);
    if (!section) throw new PublicSnapshotError("invalid-projection", `Story ${row.id} is published without a Section.`);
    return [row.id, collectStoryFacts(row, section, topicById, personById, correctionByStory.get(row.id) ?? [], publication)];
  }));

  const mediaRefs = new Map<number, { usage: string; kind: "image" | "any" }>();
  const mediaRef = (id: number | null, usage: string, kind: "image" | "any") => {
    if (id && (kind === "image" || !mediaRefs.has(id))) mediaRefs.set(id, { usage, kind });
  };
  for (const row of rows) {
    mediaRef(id(row.featuredMedia), `the lead image of Story ${row.id}`, "image");
    if (row.contentFormat !== "legacy-html") for (const mediaId of collectMediaIds(row.body)) mediaRef(Number(mediaId), `the body of Story ${row.id}`, "any");
  }
  for (const person of people) mediaRef(person.portrait, `the portrait of Person ${person.id}`, "image");
  for (const collection of collections) mediaRef(collection.artwork, `the artwork of Collection ${collection.id}`, "image");
  const updatesByStory = new Map<number, typeof liveUpdates>();
  for (const row of liveUpdates) {
    const storyId = id(row.story);
    if (storyId === null) continue;
    const list = updatesByStory.get(storyId) ?? [];
    list.push(row);
    updatesByStory.set(storyId, list);
    mediaRef(id(row.photo), `live update ${row.id}`, "image");
  }
  const catalog = await PreparedMediaCatalog.load(payload, mediaRefs);
  const registry = repositoryInteractivesForServer();
  const interactive = (key: string) => Object.hasOwn(registry, key);
  const stories = rows.map((row): PublicStorySnapshot => {
    const { body, issues } = normalizePayloadStoryBody(row, {
      media: (id) => catalog.articleAsset(Number(id)),
      references: {
        story: (id: MediaId) => {
          const story = facts.get(Number(id));
          return story && story.id !== row.id ? snapshotStoryReference(story) : null;
        },
        poll: (id) => polls.get(Number(id)),
        interactive
      }
    });
    const problems = contentLosingIssues(issues);
    if (problems.length) throw new PublicSnapshotError("invalid-projection", `Story ${row.id} cannot be projected without losing article content.`, problems);
    return { ...facts.get(row.id)!, body, live: collectLiveCoverage(row, updatesByStory.get(row.id) ?? [], catalog, publication) };
  });
  const paths = new Set([
    ...stories.map((row) => row.href), ...pages.map((row) => row.href), ...sections.map((row) => row.href),
    ...people.filter((row) => row.hasProfilePage).map((row) => `/author/${row.slug}/`),
    ...collections.map((row) => `/coverage/${row.slug}/`)
  ]);
  // Retain historical redirects while a target is offline (unpublish, trash), but
  // don't deploy a rule that would send readers to a missing public document.
  const redirects = collapseRedirects(redirectRows.docs).filter((row) => paths.has(row.to)).map(({ id, from, to }) => ({ id, from, to, status: 301 as const }));
  const datasets: Datasets = { stories, people, sections, topics, pages, corrections, collections, events, polls: [...polls.values()], media: catalog.records(), redirects };
  const snapshot = { schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION, revision, generatedAt: now.toISOString(), publication, datasets,
    counts: Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length])) };
  try {
    return validatePublicBuildSnapshotV2(snapshot, { interactive });
  } catch (error) {
    throw new PublicSnapshotError("invalid-projection", (error as Error).message);
  }
}
