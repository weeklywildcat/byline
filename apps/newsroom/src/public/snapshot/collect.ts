import { mediaKey, type MediaId } from "@byline/article-body";
import {
  publicationDateParts,
  publicationLocalMinute,
  publicStoryPath,
  validatePublicBuildSnapshotV1,
  wordpressGmtDateTime,
  wordpressLocalDateTime
} from "@byline/content";
import { escapeHtml } from "@byline/content/story";
import type { BylinePublicationConfig } from "@byline/core";
import { normalizePrimaryVideo, parseYouTubeVideoId } from "@byline/core";
import { collectMediaIds, normalizePayloadStoryBody, type NormalizeIssue } from "@byline/editor/normalize";
import type { Payload } from "payload";
import { relationId, relationIds } from "../../access/user";
import { publicCoverages } from "../../newsroom/public-coverage";
import { publicPeople, type PublicPerson } from "../../newsroom/public-people";
import { publicationConfigFromGlobal, readPublishedPublication } from "../publication-config";
import { articleBodyCompatibilityHtml } from "./article-html";
import { PublicSnapshotError } from "./errors";
import { PreparedMediaCatalog, type SnapshotAttachment } from "./media";
import { pageBodyHtml } from "./page-html";
import { correctionPublicFrom } from "../scheduled";
import { PUBLIC_SNAPSHOT_SCHEMA_VERSION } from "./version";

/**
 * The Payload public projection as snapshot v1 (docs/payload-build-snapshots.md).
 *
 * Every dataset is an explicit allowlist built from published MAIN documents
 * (never `draft: true`, never the versions table) and the existing public
 * projections (`publicPeople`, `publicCoverages`). Nothing is spread from a
 * Payload document; Users, plans, tasks, sources, appointments, production,
 * interviews, resources and briefs are never read.
 *
 * v1 deliberately looks like WordPress so the unchanged Astro consumer
 * (`apps/web/lib/wordpress.ts`) can render it and WordPress/Payload builds can
 * be compared. The same function serves the snapshot job and the
 * direct-source recovery endpoint: there is one public projection.
 */

type Row = Record<string, any>;

export type PublicSnapshotV1 = {
  schemaVersion: 1;
  revision: number;
  generatedAt: string;
  sourceTimezone: string;
  publication: BylinePublicationConfig;
  datasets: {
    posts: Row[];
    authors: Row[];
    guests: Row[];
    categories: Row[];
    tags: Row[];
    pages: Row[];
    corrections: Row[];
    coverages: Row[];
    schoolEvents: Row[];
    attachments: SnapshotAttachment[];
  };
  counts: Record<string, number>;
};

export type CollectOptions = {
  revision: number;
  /** For tests: the moment `generatedAt` records. */
  now?: () => Date;
  /** For tests: a barrier between reading the public inputs and building the projection. */
  afterRead?: () => Promise<void>;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const ids = (value: unknown) => relationIds(value).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
const id = (value: unknown) => {
  const found = Number(relationId(value));
  return Number.isSafeInteger(found) && found > 0 ? found : null;
};

function paragraphsHtml(value: string): string {
  return value ? value.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>\n`).join("") : "";
}

/** WordPress's `M j, Y g:i A` and `g:i A` in the publication's timezone. */
function eventDisplay(start: string | null, end: string | null, allDay: boolean, timeZone: string) {
  const clock = (value: string) => {
    const { hour, minute } = publicationDateParts(value, timeZone);
    const h = Number(hour);
    return `${h % 12 === 0 ? 12 : h % 12}:${minute} ${h < 12 ? "AM" : "PM"}`;
  };
  const day = (value: string) => {
    const { year, month, day: date } = publicationDateParts(value, timeZone);
    const name = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
    return `${name} ${Number(date)}, ${year} ${clock(value)}`;
  };
  return {
    date: start ? day(start) : "",
    time: allDay ? "All day" : start ? (end ? `${clock(start)}-${clock(end)}` : clock(start)) : ""
  };
}

/** Lexical/normalizer issues that mean published content would be lost or changed. */
function contentLosingIssues(issues: NormalizeIssue[]): string[] {
  return issues.flatMap((issue) => {
    if (issue.kind === "unsupported-node") return [`unsupported ${issue.nodeType} at ${issue.path}`];
    if (issue.kind === "unsupported-format") return [`unsupported ${issue.format} formatting at ${issue.path}`];
    if (issue.kind === "unsafe-link") return [`unsafe link at ${issue.path}`];
    // A block's unfinished parts are left out by design (`finalizeBlock`), exactly as Live Preview
    // and the publish readiness rules show them. Media that disappeared is not unfinished.
    if (issue.issue.code.endsWith("-unavailable")) return [`${issue.issue.type} block ${issue.issue.blockId}: ${issue.issue.message}`];
    return [];
  });
}

/** Known public social services on a staff profile; other labels stay in a guest's link list only. */
function profileSocials(person: PublicPerson) {
  const socials = { website: "", email: person.publicEmail, instagram: "", tiktok: "", linkedin: "", x: "" };
  for (const { label, url } of person.socials) {
    const key = label.trim().toLowerCase().replace(/[^a-z]/g, "");
    const target = ["website", "site", "web", "homepage"].includes(key) ? "website" : key === "twitter" ? "x" : key;
    if (target in socials && target !== "email" && !socials[target as keyof typeof socials]) socials[target as keyof typeof socials] = url;
  }
  return socials;
}

export async function collectPublicSnapshot(payload: Payload, options: CollectOptions): Promise<PublicSnapshotV1> {
  const revision = options.revision;

  /* ------------------------------------------------------------ read public inputs */
  const publicationRow = await readPublishedPublication(payload);
  const publication = publicationConfigFromGlobal(publicationRow, revision);
  const timeZone = publication.timezone;
  const site = publication.urls.publicSite.replace(/\/+$/, "");

  const [sectionsFound, topicsFound, storiesFound, pagesFound, eventsFound, people, coverages] = await Promise.all([
    payload.find({ collection: "sections", select: { name: true, slug: true, description: true, hidden: true }, depth: 0, pagination: false, sort: "name", overrideAccess: true }),
    payload.find({ collection: "topics", select: { name: true, slug: true, description: true }, depth: 0, pagination: false, sort: "name", overrideAccess: true }),
    // Published MAIN documents only. Never `draft: true`: a newer unpublished rewrite stays private.
    payload.find({
      collection: "stories",
      where: { _status: { equals: "published" } },
      select: { headline: true, deck: true, section: true, topics: true, contributors: true, featuredMedia: true, featuredCaption: true, contentFormat: true, body: true, legacyHtml: true, format: true, video: true, presentation: true, immersiveAlignment: true, reportingNote: true, slug: true, publishedAt: true, updatedAt: true, _status: true },
      depth: 0,
      pagination: false,
      overrideAccess: true
    }),
    payload.find({ collection: "pages", where: { _status: { equals: "published" } }, select: { title: true, slug: true, summary: true, body: true, noindex: true, publishedAt: true, createdAt: true, updatedAt: true, _status: true }, depth: 0, pagination: false, overrideAccess: true }),
    payload.find({ collection: "events", where: { _status: { equals: "published" } }, select: { title: true, slug: true, eventType: true, startAt: true, endAt: true, allDay: true, location: true, description: true, externalUrl: true, eventStatus: true, _status: true }, depth: 0, pagination: false, sort: "startAt", overrideAccess: true }),
    publicPeople(payload),
    publicCoverages(payload)
  ]);
  const storyIds = (storiesFound.docs as Row[]).filter((story) => story._status === "published").map((story) => story.id as number);
  const correctionsFound = storyIds.length
    ? await payload.find({ collection: "corrections", where: { story: { in: storyIds } }, select: { story: true, type: true, text: true, date: true, publishedAt: true }, depth: 0, pagination: false, overrideAccess: true })
    : { docs: [] as Row[] };
  await options.afterRead?.();

  /* ------------------------------------------------------------ sections, stories */
  const sections = new Map((sectionsFound.docs as Row[]).map((row) => [row.id as number, row]));
  const topics = new Map((topicsFound.docs as Row[]).map((row) => [row.id as number, row]));
  const problems: string[] = [];
  const stories = (storiesFound.docs as Row[])
    .filter((story) => story._status === "published")
    .filter((story) => {
      const section = sections.get(id(story.section) ?? -1);
      // Stories only in an internal section never reach the public site (Sections.hidden).
      if (section?.hidden === true) return false;
      if (!section) problems.push(`Story ${story.id} (“${text(story.headline).slice(0, 80)}”) is published without a Section, so it has no public URL. Give it a Section.`);
      if (!text(story.slug) || !story.publishedAt) problems.push(`Story ${story.id} is published without a slug or first-publication time.`);
      return Boolean(section);
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || b.id - a.id);
  if (problems.length) throw new PublicSnapshotError("invalid-projection", "Published stories cannot be given public URLs.", problems);

  /* ------------------------------------------------------------ people */
  const everyone = new Map<number, PublicPerson>([...people.authors, ...people.guests].map((person) => [person.id, person]));
  // Staff with a profile page are `authors`; guests with one are `guests`. Byline-only people appear only inside stories.
  const authorPeople = people.authors.filter((person) => person.hasProfilePage && person.slug);
  const authorIds = new Set(authorPeople.map((person) => person.id));
  const guestPeople = people.guests.filter((person) => person.hasProfilePage && person.slug);
  const credited = new Set(stories.flatMap((story) => ids(story.contributors)));

  /* ------------------------------------------------------------ media references */
  const references = new Map<number, { usage: string; kind: "image" | "document" | "any" }>();
  const reference = (mediaId: number | null, usage: string, kind: "image" | "document" | "any") => {
    if (mediaId !== null && !references.has(mediaId)) references.set(mediaId, { usage, kind });
  };
  for (const story of stories) {
    reference(id(story.featuredMedia), `the lead image of Story ${story.id}`, "image");
    if (story.contentFormat !== "legacy-html") for (const mediaId of collectMediaIds(story.body)) reference(Number(mediaId), `the body of Story ${story.id}`, "any");
  }
  for (const person of [...authorPeople, ...guestPeople, ...[...credited].map((personId) => everyone.get(personId)).filter((person): person is PublicPerson => Boolean(person))]) {
    if (person.portrait) reference(person.portrait.id, `the portrait of ${person.name} (Person ${person.id})`, "image");
  }
  const publishedStoryIds = new Set(stories.map((story) => story.id as number));
  const publicCoveragesList = coverages.filter((coverage) => coverage.slug && coverage.title);
  for (const coverage of publicCoveragesList) if (coverage.artwork) reference(coverage.artwork.id, `the artwork of Collection ${coverage.id}`, "image");
  const catalog = await PreparedMediaCatalog.load(payload, references);

  /* ------------------------------------------------------------ people records */
  const portrait = (person: PublicPerson) => (person.portrait ? catalog.photo(person.portrait.id, { shape: "square", minWidth: 640 }) : undefined);
  const authorRecord = (person: PublicPerson) => {
    const photo = portrait(person);
    const profile = {
      pronouns: person.pronouns,
      role: person.newsroomRole,
      shortBio: person.shortBio,
      showInDirectory: person.directoryVisible,
      ...(photo ? { profilePhoto: photo } : {}),
      socials: profileSocials(person)
    };
    return { id: person.id, name: person.name, slug: person.slug, description: person.bio || person.shortBio, url: "", link: `${site}/author/${person.slug}/`, bylineProfile: profile, weeklyWildcatProfile: profile };
  };
  const guestRecord = (person: PublicPerson, hasProfilePage: boolean, roleFallback: string) => {
    const photo = portrait(person);
    return {
      type: "guest",
      id: person.id,
      name: person.name,
      slug: person.slug,
      hasProfilePage,
      bio: person.bio || person.shortBio,
      role: person.newsroomRole || roleFallback,
      ...(photo ? { profilePhoto: photo } : {}),
      ...(person.socials.length ? { links: person.socials.map(({ label, url }) => ({ label, url })) } : {})
    };
  };
  const authors = authorPeople.map(authorRecord);
  const authorsById = new Map(authors.map((author) => [author.id, author]));
  const guests = guestPeople.map((person) => guestRecord(person, true, "Guest contributor"));
  const contributorRecord = (personId: number) => {
    const person = everyone.get(personId);
    if (!person) return null;
    if (authorIds.has(personId)) return { type: "user", id: person.id, name: person.name, slug: person.slug, link: `${site}/author/${person.slug}/` };
    // A staff member without a profile page, or a byline-only guest: credited by name (and photo), no archive.
    if (person.status !== "guest") return guestRecord(person, false, "Contributor");
    return guestRecord(person, person.hasProfilePage && Boolean(person.slug), "Guest contributor");
  };

  /* ------------------------------------------------------------ corrections */
  const correctionsByStory = new Map<number, Row[]>();
  const collectedAt = (options.now?.() ?? new Date()).getTime();
  for (const correction of correctionsFound.docs as Row[]) {
    const storyId = id(correction.story);
    if (storyId === null || !publishedStoryIds.has(storyId) || !text(correction.text)) continue;
    // "Shown publicly from" a future time: hidden until then (a delayed job advances the revision at that moment).
    const from = correctionPublicFrom(correction);
    if (from !== null && from > collectedAt) continue;
    const list = correctionsByStory.get(storyId) ?? [];
    list.push(correction);
    correctionsByStory.set(storyId, list);
  }
  for (const list of correctionsByStory.values()) list.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id - b.id);
  const correctionRecord = (correction: Row) => ({ id: correction.id as number, type: String(correction.type ?? "correction"), text: text(correction.text), date: new Date(correction.date).toISOString() });

  /* ------------------------------------------------------------ posts */
  const contentProblems: string[] = [];
  const categoryCounts = new Map<number, number>();
  const tagCounts = new Map<number, number>();
  const sectionTerm = (section: Row) => ({ id: section.id as number, count: 0, description: text(section.description), link: `${site}/category/${section.slug}/`, name: text(section.name), slug: String(section.slug), taxonomy: "category", parent: 0 });
  const topicTerm = (topic: Row) => ({ id: topic.id as number, count: 0, description: text(topic.description), link: `${site}/tag/${topic.slug}/`, name: text(topic.name), slug: String(topic.slug), taxonomy: "post_tag" });

  const posts = await Promise.all(stories.map(async (story) => {
    const section = sections.get(id(story.section)!)!;
    const storyTopics = ids(story.topics).map((topicId) => topics.get(topicId)).filter((topic): topic is Row => Boolean(topic));
    const path = publicStoryPath({ slug: story.slug, sectionSlug: section.slug, publishedAt: story.publishedAt, timeZone });
    const headline = text(story.headline);

    let html: string;
    if (story.contentFormat === "legacy-html") {
      html = typeof story.legacyHtml === "string" ? story.legacyHtml.trim() : "";
    } else {
      const { body, issues } = normalizePayloadStoryBody(
        { contentFormat: story.contentFormat, body: story.body },
        { media: (mediaId: MediaId) => catalog.articleAsset(Number(mediaKey(mediaId))) }
      );
      const losing = contentLosingIssues(issues);
      if (losing.length) contentProblems.push(`Story ${story.id} (“${headline.slice(0, 80)}”): ${losing.slice(0, 5).join("; ")}`);
      html = body.format === "byline-v1" ? await articleBodyCompatibilityHtml(body) : body.html;
    }

    const contributorIds = ids(story.contributors);
    const contributors = contributorIds.map(contributorRecord).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    // `author` exists only for WordPress compatibility: the first credited staff author with a profile.
    const primary = contributorIds.find((personId) => authorIds.has(personId)) ?? null;
    const featuredId = id(story.featuredMedia);
    const featured = featuredId !== null ? catalog.attachment(featuredId, { caption: text(story.featuredCaption) }) : null;
    const videoId = story.format === "video" ? parseYouTubeVideoId(story.video?.url) : null;
    const metadata = story.video?.metadata && typeof story.video.metadata === "object" ? story.video.metadata : {};
    const video = videoId ? normalizePrimaryVideo({ provider: "youtube", videoId, title: metadata.title, description: metadata.description, thumbnailUrl: metadata.thumbnailUrl, uploadDate: metadata.uploadDate, duration: metadata.duration }) : null;
    const settings = {
      presentation: story.presentation === "immersive" ? "immersive" : "standard",
      immersiveAlignment: story.immersiveAlignment === "center" ? "center" : "bottom-left",
      reportingNote: typeof story.reportingNote === "string" ? story.reportingNote : "",
      format: story.format === "video" || story.format === "audio" ? story.format : "standard",
      ...(video ? { video } : {})
    };
    categoryCounts.set(section.id, (categoryCounts.get(section.id) ?? 0) + 1);
    for (const topic of storyTopics) tagCounts.set(topic.id, (tagCounts.get(topic.id) ?? 0) + 1);
    return {
      id: story.id as number,
      date: wordpressLocalDateTime(story.publishedAt, timeZone),
      date_gmt: wordpressGmtDateTime(story.publishedAt),
      modified: wordpressLocalDateTime(story.updatedAt ?? story.publishedAt, timeZone),
      modified_gmt: wordpressGmtDateTime(story.updatedAt ?? story.publishedAt),
      slug: String(story.slug),
      status: "publish",
      type: "post",
      link: `${site}${path}`,
      title: { rendered: escapeHtml(headline) },
      excerpt: { rendered: paragraphsHtml(text(story.deck)) },
      content: { rendered: html },
      author: primary ?? 0,
      featured_media: featuredId ?? 0,
      categories: [section.id as number],
      tags: storyTopics.map((topic) => topic.id as number),
      sticky: false,
      byline: settings,
      weeklyWildcat: settings,
      contributors,
      corrections: (correctionsByStory.get(story.id) ?? []).map(correctionRecord),
      _embedded: {
        author: primary !== null ? [authorsById.get(primary)!] : [],
        "wp:featuredmedia": featured ? [featured] : [],
        "wp:term": [[sectionTerm(section)], storyTopics.map(topicTerm)]
      }
    };
  }));
  if (contentProblems.length) throw new PublicSnapshotError("unsupported-story-content", `${contentProblems.length} published story body/bodies contain content the public snapshot cannot carry without losing it.`, contentProblems);

  // Counts come only from the included published posts.
  for (const post of posts) {
    for (const term of post._embedded["wp:term"][0]) term.count = categoryCounts.get(term.id) ?? 0;
    for (const term of post._embedded["wp:term"][1]) term.count = tagCounts.get(term.id) ?? 0;
  }
  const categories = [...sections.values()].filter((section) => section.hidden !== true && section.slug).map((section) => ({ ...sectionTerm(section), count: categoryCounts.get(section.id) ?? 0 }));
  const tags = [...topics.values()].filter((topic) => topic.slug).map((topic) => ({ ...topicTerm(topic), count: tagCounts.get(topic.id) ?? 0 }));

  /* ------------------------------------------------------------ corrections dataset */
  const postById = new Map(posts.map((post) => [post.id, post]));
  const corrections = [...correctionsByStory.entries()]
    .flatMap(([storyId, list]) => list.map((correction) => {
      const post = postById.get(storyId);
      return post ? { ...correctionRecord(correction), storyId, story: { id: storyId, title: text(stories.find((story) => story.id === storyId)?.headline), url: post.link, slug: post.slug } } : null;
    }))
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  /* ------------------------------------------------------------ pages */
  const pages = (pagesFound.docs as Row[])
    .filter((page) => page._status === "published")
    .sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
    .map((page) => {
      const published = page.publishedAt ?? page.createdAt;
      return {
        id: page.id as number,
        date: wordpressLocalDateTime(published, timeZone),
        date_gmt: wordpressGmtDateTime(published),
        modified: wordpressLocalDateTime(page.updatedAt ?? published, timeZone),
        modified_gmt: wordpressGmtDateTime(page.updatedAt ?? published),
        slug: String(page.slug),
        status: "publish",
        type: "page",
        link: `${site}/${page.slug}/`,
        title: { rendered: escapeHtml(text(page.title)) },
        excerpt: { rendered: paragraphsHtml(text(page.summary)) },
        content: { rendered: pageBodyHtml(page.body, { id: page.id, title: text(page.title) }) },
        bylinePage: { indexing: page.noindex === true ? "noindex" : "public" }
      };
    });

  /* ------------------------------------------------------------ coverages */
  const coverageRecords = publicCoveragesList.map((coverage) => ({
    id: coverage.id,
    slug: coverage.slug,
    title: coverage.title,
    format: coverage.format,
    description: coverage.description,
    overview: coverage.overview,
    ...(coverage.startDate ? { startAt: coverage.startDate } : {}),
    ...(coverage.endDate ? { endAt: coverage.endDate } : {}),
    status: coverage.status,
    artwork: coverage.artwork ? catalog.photo(coverage.artwork.id, { shape: "square", minWidth: 960 }) : null,
    stories: coverage.stories.flatMap((entry) => {
      const post = postById.get(entry.id);
      return post ? [{ id: post.id, slug: post.slug, title: text(stories.find((story) => story.id === post.id)?.headline), url: post.link, excerpt: post.excerpt.rendered, publishedAt: post.date, modifiedAt: post.modified }] : [];
    })
  }));

  /* ------------------------------------------------------------ events */
  const schoolEvents = (eventsFound.docs as Row[])
    .filter((event) => event._status === "published" && event.startAt)
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt) || a.id - b.id)
    .map((event) => {
      const status = event.eventStatus === "canceled" ? "canceled" : "scheduled";
      const display = eventDisplay(event.startAt, event.endAt ?? null, event.allDay === true, timeZone);
      return {
        id: event.id as number,
        title: text(event.title),
        slug: String(event.slug),
        eventType: text(event.eventType),
        startDate: publicationLocalMinute(event.startAt, timeZone),
        endDate: event.endAt ? publicationLocalMinute(event.endAt, timeZone) : "",
        allDay: event.allDay === true,
        location: text(event.location),
        description: typeof event.description === "string" ? event.description : "",
        externalUrl: text(event.externalUrl),
        status,
        display: { ...display, status: status === "canceled" ? "Canceled" : "Scheduled" }
      };
    });

  /* ------------------------------------------------------------ envelope */
  const datasets = {
    posts,
    authors,
    guests,
    categories,
    tags,
    pages,
    corrections,
    coverages: coverageRecords,
    schoolEvents,
    attachments: catalog.attachments()
  };
  const snapshot: PublicSnapshotV1 = {
    schemaVersion: PUBLIC_SNAPSHOT_SCHEMA_VERSION,
    revision,
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    sourceTimezone: timeZone,
    publication,
    datasets,
    counts: Object.fromEntries(Object.entries(datasets).map(([name, rows]) => [name, rows.length]))
  };
  validatePublicSnapshot(snapshot);
  return snapshot;
}

/**
 * The shared v1 validator plus the Payload producer's own guarantees: the
 * publication timezone is the source timezone, every post's canonical link
 * is the route the public site will compute from it, every attachment is a
 * prepared one, and every referenced Media is in the catalog.
 */
export function validatePublicSnapshot(snapshot: PublicSnapshotV1): void {
  try {
    validatePublicBuildSnapshotV1(snapshot);
  } catch (error) {
    throw new PublicSnapshotError("invalid-projection", (error as Error).message);
  }
  const fail = (message: string) => {
    throw new PublicSnapshotError("invalid-projection", `Invalid Payload snapshot: ${message}`);
  };
  if (snapshot.sourceTimezone !== snapshot.publication.timezone) fail("sourceTimezone differs from the publication timezone");
  const site = snapshot.publication.urls.publicSite.replace(/\/+$/, "");
  const attachments = new Set(snapshot.datasets.attachments.map((attachment) => attachment.id));
  for (const attachment of snapshot.datasets.attachments) if (!attachment.bylinePublication) fail(`attachment ${attachment.id} is not a prepared publication asset`);
  for (const post of snapshot.datasets.posts) {
    const category = post._embedded["wp:term"][0][0];
    const [day] = String(post.date).split("T");
    const [year, month, date] = day.split("-");
    if (post.link !== `${site}/${year}/${month}/${date}/${category?.slug}/${post.slug}/`) fail(`post ${post.id} link ${post.link} is not its canonical route`);
    if (post.featured_media && !attachments.has(post.featured_media)) fail(`post ${post.id} featured media ${post.featured_media} is not in the attachment catalog`);
    for (const match of String(post.content.rendered).matchAll(/\/_byline\/media\/[^"'\s)#?]+/g)) {
      if (!snapshot.datasets.attachments.some((attachment) => JSON.stringify(attachment.bylinePublication).includes(match[0]))) fail(`post ${post.id} body names ${match[0]}, which no prepared attachment provides`);
    }
  }
}
