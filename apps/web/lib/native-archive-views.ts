import { largestNaturalImage, legacyRenditionsFromManifest, publicationLocalMinute, publicationUtcDateTime, publicationLocalDateTime, type PublicBuildSnapshotV2, type PublicMediaSnapshot, type PublicPersonSnapshot } from "@byline/content";
import { escapeHtml } from "@byline/content/story";
import type { SchoolEvent } from "./headless";
import { getNativeSnapshot } from "./native-snapshot";
import type { ArchiveAuthor, ArchiveCategory, ArchiveGuestContributor, ArchiveMedia, ArchivePage, ArchivePost, ArchiveTag } from "./public-content";

type NativeLiveCoverage = PublicBuildSnapshotV2["datasets"]["stories"][number]["live"];
type ArchiveLiveState = Pick<NonNullable<NativeLiveCoverage>, "status" | "startedAt" | "endedAt"> & { updates?: unknown[] };

/**
 * Archive pages and cards only need the coverage state. Keeping the full live
 * timeline here would make every update invalidate section/author/homepage
 * render inputs even though those surfaces only render the LIVE badge.
 */
export function archiveLiveState(live: ArchiveLiveState | null) {
  return live ? { status: live.status, startedAt: live.startedAt, endedAt: live.endedAt, updates: [] } : undefined;
}

/**
 * Transitional views for the existing Weekly Wildcat home, archives, cards and
 * directory. Canonical article rendering reads native Stories directly.
 * This adapter is local to the web app and never serializes a structured body.
 */
export function nativeArchiveViews({ datasets, publication }: PublicBuildSnapshotV2) {
  const site = publication.urls.publicSite.replace(/\/+$/, "");
  const local = (iso: string) => publicationLocalDateTime(iso, publication.timezone);
  const media = new Map(datasets.media.map((entry) => [entry.id, entry]));
  const categoryCounts = new Map<string, number>();
  for (const story of datasets.stories) for (const key of story.sectionKeys) categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const story of datasets.stories) for (const key of story.topicKeys) tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
  const categories = new Map(datasets.sections.map((entry): [string, ArchiveCategory] => [`section-${entry.id}`, {
    ...entry, link: site + entry.href, taxonomy: "category", parent: 0, count: categoryCounts.get(`section-${entry.id}`) ?? 0
  }]));
  const tags = new Map(datasets.topics.map((entry): [string, ArchiveTag] => [`topic-${entry.id}`, {
    ...entry, link: entry.href ? site + entry.href : "", taxonomy: "post_tag", count: tagCounts.get(`topic-${entry.id}`) ?? 0
  }]));

  function photo(id: number | null) {
    const entry = id === null ? undefined : media.get(id);
    if (entry?.manifest.kind !== "image") return undefined;
    const file = entry.manifest.crops.square?.renditions.at(-1) ?? largestNaturalImage(entry.manifest);
    const { x, y } = entry.manifest.focalPoint;
    return { id: entry.id, url: file.publicPath, width: file.width, height: file.height, alt: entry.alt,
      ...(!entry.manifest.crops.square && (x !== 50 || y !== 50) ? { objectPosition: `${x}% ${y}%` } : {}) };
  }
  const people = new Map(datasets.people.map((person) => [person.id, person]));
  const guest = (person: PublicPersonSnapshot): ArchiveGuestContributor & { links: PublicPersonSnapshot["socials"] } => ({
    type: "guest", id: person.id, name: person.name, slug: person.slug, hasProfilePage: person.hasProfilePage, description: person.bio || person.shortBio,
    role: person.newsroomRole || (person.status === "guest" ? "Guest contributor" : "Contributor"), profilePhoto: photo(person.portrait), links: person.socials
  });
  const socials = (person: PublicPersonSnapshot) => {
    const byService = Object.fromEntries(person.socials.map(({ label, url }) => [label.toLowerCase().replace(/[^a-z]/g, ""), url]));
    return { website: byService.website || byService.homepage || byService.site || "", email: person.publicEmail,
      instagram: byService.instagram || "", tiktok: byService.tiktok || "", linkedin: byService.linkedin || "", x: byService.x || byService.twitter || "" };
  };
  const author = (person: PublicPersonSnapshot): ArchiveAuthor => ({
    id: person.id, name: person.name, slug: person.slug, description: person.bio || person.shortBio, link: `${site}/author/${person.slug}/`,
    bylineProfile: { pronouns: person.pronouns, role: person.newsroomRole, shortBio: person.shortBio, showInDirectory: person.directoryVisible,
      profilePhoto: photo(person.portrait), socials: socials(person) }
  });
  const authors = datasets.people.filter((entry) => entry.status !== "guest" && entry.hasProfilePage).map(author);
  const authorsById = new Map(authors.map((entry) => [entry.id, entry]));
  const posts: ArchivePost[] = datasets.stories.map((story) => {
    const contributors = story.contributorKeys.map((key) => {
      const id = Number(key.split(":")[1]);
      const staff = authorsById.get(id);
      return staff ? { ...staff, type: "user" } : guest(people.get(id)!);
    });
    const primary = contributors.find(({ type }) => type === "user")?.id;
    const feature = story.image ? archiveImage(media.get(story.image)!, story.leadCaption) : null;
    const section = story.sectionKeys.map((key) => categories.get(key)!);
    const topics = story.topicKeys.map((key) => tags.get(key)!);
    return {
      id: story.id, slug: story.slug, link: story.url, title: { rendered: story.titleHtml }, excerpt: { rendered: story.excerptHtml },
      content: { rendered: story.body.format === "legacy-html" ? story.body.html : "" },
      date: local(story.publishedAt), date_gmt: publicationUtcDateTime(story.publishedAt),
      modified: local(story.modifiedAt), modified_gmt: publicationUtcDateTime(story.modifiedAt),
      status: "publish", type: "post", author: Number(primary ?? 0), featured_media: story.image ?? 0,
      categories: section.map(({ id }) => id), tags: topics.map(({ id }) => id), sticky: false, contributors, corrections: story.corrections,
      live: archiveLiveState(story.live),
      byline: { presentation: story.presentation, immersiveAlignment: story.immersiveAlignment, format: story.format, video: story.videoMetadata },
      _embedded: { author: primary ? [authorsById.get(Number(primary))!] : [], "wp:featuredmedia": feature ? [feature] : [], "wp:term": [section, topics] }
    };
  });
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const storyById = new Map(datasets.stories.map((story) => [story.id, story]));
  return {
    posts, authors, guests: datasets.people.filter((person) => person.status === "guest" && person.hasProfilePage).map(guest),
    categories: [...categories.values()], tags: [...tags.values()],
    pages: datasets.pages.map((entry) => ({
      id: entry.id, slug: entry.slug, date: local(entry.publishedAt), modified: local(entry.modifiedAt),
      date_gmt: publicationUtcDateTime(entry.publishedAt), modified_gmt: publicationUtcDateTime(entry.modifiedAt),
      title: { rendered: escapeHtml(entry.title) }, excerpt: { rendered: escapeHtml(entry.summary) }, content: { rendered: entry.bodyHtml },
      bylinePage: { indexing: entry.indexing }
    })),
    corrections: datasets.corrections.map((entry) => {
      const story = storyById.get(entry.storyId)!;
      return { ...entry, story: { id: story.id, title: story.title, url: story.url, slug: story.slug } };
    }).reverse(),
    coverages: datasets.collections.map((entry) => ({
      id: entry.id, slug: entry.slug, title: entry.title, format: entry.format, description: entry.description, overview: entry.overview,
      startAt: entry.startAt, endAt: entry.endAt, status: entry.status, modified: entry.modifiedAt, artwork: photo(entry.artwork) ?? null,
      stories: entry.stories.map((id) => {
        const story = storyById.get(id)!;
        const post = postsById.get(id)!;
        return { id, slug: story.slug, title: story.title, url: story.url, excerpt: story.excerptHtml, publishedAt: post.date, modifiedAt: post.modified };
      })
    })),
  };
}

function archiveImage(entry: PublicMediaSnapshot, caption: string): ArchiveMedia | null {
  if (entry.manifest.kind !== "image") return null;
  const { manifest } = entry;
  const fallback = largestNaturalImage(manifest);
  return {
    id: entry.id, date: "", slug: entry.filename, link: "", title: { rendered: "" }, author: 0,
    type: "attachment", media_type: "image", mime_type: fallback.mimeType, alt_text: entry.alt,
    caption: { rendered: escapeHtml(caption) }, source_url: fallback.publicPath,
    media_details: {
      width: fallback.width, height: fallback.height, sizes: Object.fromEntries(manifest.natural.map((file) => [`natural-${file.width}`, {
        file: file.publicPath.split("/").at(-1)!, width: file.width, height: file.height, mime_type: file.mimeType, source_url: file.publicPath
      }]))
    },
    bylineImage: { creator: entry.creator, creditText: entry.credit, copyrightNotice: entry.copyright, licenseUrl: entry.license, acquireLicensePage: "",
      artDirection: { focalPoint: manifest.focalPoint, crops: {}, renditions: legacyRenditionsFromManifest(manifest) } }
  };
}

export function nativeUpcomingEvents(snapshot: PublicBuildSnapshotV2, limit: number, now = new Date()): SchoolEvent[] {
  const { locale, timezone: timeZone } = snapshot.publication;
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone });
  return snapshot.datasets.events.filter((event) => Date.parse(event.startAt) >= now.getTime()).slice(0, limit).map((event) => {
    const start = new Date(event.startAt);
    const end = event.endAt ? new Date(event.endAt) : null;
    return {
      id: event.id, title: event.title, slug: event.slug, eventType: event.type, startDate: publicationLocalMinute(event.startAt, timeZone),
      endDate: event.endAt ? publicationLocalMinute(event.endAt, timeZone) : "", allDay: event.allDay, location: event.location, description: event.description,
      externalUrl: event.externalUrl, status: event.status,
      display: { date: date.format(start), time: event.allDay ? "All day" : end ? time.formatRange(start, end) : time.format(start), status: event.status === "canceled" ? "Canceled" : "Scheduled" }
    };
  });
}

export function publicPageHref(page: Pick<ArchivePage, "id" | "slug">): string {
  return getNativeSnapshot()?.datasets.pages.find(({ id }) => id === page.id)?.href ?? `/${page.slug}/`;
}
