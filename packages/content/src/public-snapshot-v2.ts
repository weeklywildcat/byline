import { FIXED_PUBLIC_CONTENT_ROUTES, isCodeOwnedPublicPath } from "./routing";
import { isCanonicalRedirectPath } from "./redirect-path";
import { z } from "zod";
import { mediaCredit, mediaKindOf, validateArticleBody, type ArticleBody, type PublicPollReference } from "@byline/article-body";
import { youTubeEmbedUrl, type BylinePublicationConfig, type PrimaryVideo } from "@byline/core";
import { largestNaturalImage, publicationManifestBlobs, validatePublicationMediaManifest, type PublicationMediaManifest } from "./publication-media";
import { stableSerialize } from "./digests";
import { publicStoryPath } from "./publication-dates";
import { escapeHtml, type PublicStory, type PublicTerm } from "./story";

export const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const PUBLIC_POLL_MIN_RESULTS_VOTES = 5;

const text = z.string();
const name = text.min(1);
const id = z.number().int().positive();
const count = z.number().int().nonnegative();
const instant = z.iso.datetime({ offset: true });
const slug = text.regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/);
const href = text.regex(/^\/(?:[a-z0-9_-]+\/)*$/);
const url = z.url({ protocol: /^https?$/ }).refine((value) => {
  try {
    const parsed = new URL(value);
    return !/\s/.test(value) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}, "Expected a public HTTP(S) URL");
const link = z.union([url, text.regex(/^\/(?!\/)[^\s\\]*$/)]);
const obj = z.strictObject;
const asset = obj({ url: link, alt: text, width: id.nullable(), height: id.nullable() });
const taxonomy = obj({ id, slug, name, description: text, href: href.or(z.literal("")) });
const term = obj({ key: name, name, href: href.or(z.literal("")) });
const correction = obj({ id: name, type: z.enum(["correction", "clarification", "editor-note", "substantive-update"]), date: instant, text: name });
const person = obj({
  id, name, slug: slug.or(z.literal("")), pronouns: text, newsroomRole: text, shortBio: text, bio: text,
  status: z.enum(["active", "alumni", "guest"]), portrait: id.nullable(), directoryVisible: z.boolean(), hasProfilePage: z.boolean(),
  publicEmail: z.email().or(z.literal("")), socials: z.array(obj({ label: name, url: link }))
});
const contributor = obj({ id: name, keys: z.array(name), name, href: href.or(z.literal("")), role: text, bio: text, photo: id.nullable(), contactHref: text.regex(/^mailto:[^\s]+$/).optional() });
const video = obj({
  provider: z.literal("youtube"), videoId: text.regex(/^[\w-]{11}$/), url, title: text.optional(), description: text.optional(), thumbnailUrl: url.optional(),
  uploadDate: instant.optional(), duration: text.optional()
});
const articleBody = z.custom<ArticleBody>((value) => validateArticleBody(value).ok, "Invalid structured ArticleBody");
const manifest = z.custom<PublicationMediaManifest>((value) => validatePublicationMediaManifest(value).ok, "Invalid prepared Media manifest");

const liveUpdate = obj({
  id, title: text, html: text, date: instant, dateLabel: name, author: text.optional(),
  authorHref: href.nullable().optional(), authorRole: text.nullable().optional(),
  authorPhoto: obj({ src: link, width: id.nullable().optional(), height: id.nullable().optional() }).nullable().optional(),
  image: obj({ src: link, alt: text, width: id.nullable().optional(), height: id.nullable().optional(), credit: text.optional() }).nullable().optional()
});
const live = obj({
  postId: id, status: z.enum(["live", "ended"]), startedAt: instant, endedAt: instant.nullable(), endedLabel: text.nullable(),
  updatedAt: instant, updatedLabel: name, keyPoints: liveUpdate.nullable(), updates: z.array(liveUpdate),
  feedUrl: text.regex(/^\/_byline\/live\/\d+\.json$/)
});
const story = obj({
  id, slug, title: name, titleHtml: name, kicker: text.optional(), excerptHtml: text, href, url,
  publishedAt: instant, modifiedAt: instant, section: term, sections: z.array(term).min(1), topics: z.array(term),
  sectionKeys: z.array(name), topicKeys: z.array(name), contributorKeys: z.array(name), contributors: z.array(contributor),
  image: id.nullable(), leadCaption: text, listed: z.boolean(), athleteMeta: z.array(text),
  format: z.enum(["standard", "audio", "video"]), presentation: z.enum(["standard", "immersive"]), immersiveAlignment: z.enum(["center", "bottom-left"]),
  video: obj({ duration: text.nullable() }).nullable(),
  primaryVideo: obj({ videoId: text.regex(/^[\w-]{11}$/), title: name, embedUrl: url, duration: text.nullable().optional() }).nullable(),
  videoMetadata: video.nullable(), corrections: z.array(correction), reportingNote: z.array(text),
  live: live.nullable(), body: z.union([obj({ format: z.literal("legacy-html"), html: text }), articleBody])
});
const collection = obj({
  id, slug, title: name, format: z.enum(["coverage", "series"]), description: text, overview: text,
  status: z.enum(["upcoming", "active", "past", "archived"]), artwork: id.nullable(), startAt: z.iso.date().optional(),
  endAt: z.iso.date().optional(), modifiedAt: instant, stories: z.array(id)
});
const event = obj({
  id, slug, title: name, type: text, startAt: instant, endAt: instant.nullable(), allDay: z.boolean(),
  location: text, description: text, externalUrl: url.or(z.literal("")), status: z.enum(["scheduled", "canceled"])
});
const page = obj({ id, slug, title: name, href, summary: text, bodyHtml: text, indexing: z.enum(["public", "noindex"]), publishedAt: instant, modifiedAt: instant });
const poll = obj({
  id: name.max(64), question: name.max(300), options: z.array(obj({ id: name.max(64), label: name.max(200) })).min(2).max(12),
  votingOpen: z.boolean(), results: obj({ totalVotes: count, votes: z.record(name, count) }).optional()
});
const media = obj({ id, filename: name, kind: z.enum(["image", "audio", "document"]), alt: text, creator: text, credit: text, copyright: text, license: text, manifest });
const redirectPath = text.refine(isCanonicalRedirectPath, "Expected a canonical literal public path");
const redirect = obj({ id, from: redirectPath, to: redirectPath, status: z.literal(301) });

const publication = obj({
  schemaVersion: z.literal(1), revision: count,
  identity: obj({ name, shortName: name, description: text, organizationName: name, tagline: text }),
  location: obj({ display: text, city: text, region: text, country: text, address: text }),
  locale: name, timezone: name, urls: obj({ publicSite: url, cms: url, contact: link }),
  branding: obj({ masthead: asset, logo: asset, organizationLogo: asset, icons: z.array(asset), defaultSocialImage: asset }),
  appearance: obj({ theme: z.literal("weekly-wildcat"), tokenOverrides: z.record(text, text) }),
  sections: z.array(obj({ slug, name, description: text, active: z.boolean() })),
  navigation: z.array(obj({ label: name, url: link, locations: z.array(z.enum(["header", "footer"])), group: text.optional(), feature: text.optional() })),
  social: z.array(obj({ service: name, label: name, url: link })),
  features: z.record(text, z.boolean()),
  licensing: obj({ copyrightNotice: text, imageLicenseUrl: link.or(z.literal("")), acquireLicensePage: link.or(z.literal("")) }),
  seo: obj({ defaultTitle: name, defaultDescription: text, organizationType: z.enum(["Organization", "NewsMediaOrganization"]) })
});

const datasets = obj({
  stories: z.array(story), people: z.array(person), sections: z.array(taxonomy), topics: z.array(taxonomy),
  pages: z.array(page), corrections: z.array(correction.extend({ storyId: id })), collections: z.array(collection),
  events: z.array(event), polls: z.array(poll), media: z.array(media), redirects: z.array(redirect)
});
export const publicBuildSnapshotV2Schema = obj({
  schemaVersion: z.literal(PUBLIC_SNAPSHOT_SCHEMA_VERSION), revision: count, generatedAt: instant, publication, datasets,
  counts: z.record(datasets.keyof(), count)
});

export type PublicStorySnapshot = PublicStory<number> & Omit<z.infer<typeof story>, keyof PublicStory<number>> & { id: number; section: PublicTerm; videoMetadata: PrimaryVideo | null };
export type PublicPersonSnapshot = z.infer<typeof person>;
export type PublicMediaSnapshot = z.infer<typeof media>;
export type PublicCorrectionSnapshot = z.infer<typeof datasets.shape.corrections>[number];
export type PublicCollectionSnapshot = z.infer<typeof collection>;
export type PublicBuildSnapshotV2 = Omit<z.infer<typeof publicBuildSnapshotV2Schema>, "publication" | "datasets"> & {
  publication: BylinePublicationConfig;
  datasets: Omit<z.infer<typeof datasets>, "stories" | "polls"> & { stories: PublicStorySnapshot[]; polls: PublicPollReference[] };
};

const requireFact = (condition: unknown, detail: string) => {
  if (!condition) throw new Error(`Invalid Byline build snapshot: ${detail}`);
};
const same = (left: unknown, right: unknown) => stableSerialize(left) === stableSerialize(right);

export function validatePublicBuildSnapshotV2(value: unknown, options: { interactive?: (key: string) => boolean } = {}): PublicBuildSnapshotV2 {
  const result = publicBuildSnapshotV2Schema.safeParse(value);
  if (!result.success) throw new Error(`Invalid Byline build snapshot: ${result.error.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
  const snapshot = value as PublicBuildSnapshotV2;
  const { publication, datasets: data } = snapshot;
  requireFact(publication.revision === snapshot.revision, "publication revision differs");
  try {
    new Intl.DateTimeFormat(publication.locale, { timeZone: publication.timezone });
  } catch {
    requireFact(false, "invalid publication locale or timezone");
  }
  for (const [key, rows] of Object.entries(data)) {
    requireFact(rows.length === snapshot.counts[key as keyof typeof data], `${key} count differs`);
    requireFact(new Set(rows.map((row) => row.id)).size === rows.length, `${key} has duplicate IDs`);
  }
  const mediaById = new Map(data.media.map((row) => [row.id, row]));
  const people = new Map(data.people.map((row) => [row.id, row]));
  const stories = new Map(data.stories.map((row) => [row.id, row]));
  const polls = new Map(data.polls.map((row) => [row.id, row]));
  const sections = new Map(data.sections.map((row) => [`section-${row.id}`, row]));
  const topics = new Map(data.topics.map((row) => [`topic-${row.id}`, row]));
  const paths = new Set<string>(["/"]);
  function claim(path: string) {
    requireFact(!paths.has(path), `duplicate public path ${path}`);
    paths.add(path);
  }
  function image(value: number | null) {
    requireFact(value === null || mediaById.get(value)?.kind === "image", `missing image Media ${value}`);
  }
  const blobs = new Map<string, string>();
  for (const row of data.media) {
    const kind = row.manifest.kind === "image" ? "image" : mediaKindOf(row.manifest.file.mimeType);
    requireFact(row.kind === kind, `Media ${row.id} kind differs`);
    for (const file of publicationManifestBlobs(row.manifest)) {
      const identity = `${file.sha256}:${file.bytes}:${file.mimeType}`;
      const previous = blobs.get(file.publicPath);
      requireFact(!previous || previous === identity, `Media ${row.id} has conflicting descriptors for ${file.publicPath}`);
      blobs.set(file.publicPath, identity);
    }
  }
  for (const row of data.people) {
    image(row.portrait);
    if (row.hasProfilePage) {
      requireFact(row.slug, `Person ${row.id} profile requires a slug`);
      claim(`/author/${row.slug}/`);
    }
  }
  for (const [index, prefix] of [[sections, "category"], [topics, "tag"]] as const) {
    for (const row of index.values()) {
      requireFact((prefix === "tag" && row.href === "") || row.href === `/${prefix}/${row.slug}/`, `invalid taxonomy route ${row.href}`);
      if (row.href) claim(row.href);
    }
  }
  const pagePaths = new Set(data.pages.map((row) => row.href));
  for (const row of data.pages) {
    const suffix = `/${row.slug}/`;
    requireFact(row.href.endsWith(suffix), `Page ${row.id} path does not match its slug`);
    const parent = row.href.slice(0, -suffix.length) + "/";
    requireFact(parent === "/" || pagePaths.has(parent), `Page ${row.id} has no public parent`);
    claim(row.href);
  }
  for (const row of data.collections) {
    claim(`/coverage/${row.slug}/`);
    image(row.artwork);
    requireFact(new Set(row.stories).size === row.stories.length && row.stories.every((id) => stories.has(id)), `Collection ${row.id} has invalid members`);
    requireFact(!row.startAt || !row.endAt || row.startAt <= row.endAt, `Collection ${row.id} ends before it starts`);
  }
  for (const row of data.events) {
    requireFact(!row.endAt || Date.parse(row.endAt) >= Date.parse(row.startAt), `Event ${row.id} ends before it starts`);
  }
  for (const row of data.polls) {
    const options = new Set(row.options.map((option) => option.id));
    requireFact(options.size === row.options.length, `Poll ${row.id} has duplicate options`);
    if (row.results) {
      const votes = Object.entries(row.results.votes);
      requireFact(!row.votingOpen && row.results.totalVotes >= PUBLIC_POLL_MIN_RESULTS_VOTES && votes.length === options.size && votes.every(([key]) => options.has(key))
        && votes.reduce((sum, [, value]) => sum + value, 0) === row.results.totalVotes, `Poll ${row.id} has inconsistent public results`);
    }
  }
  const corrections = new Map<number, Array<Omit<PublicCorrectionSnapshot, "storyId">>>();
  for (const { storyId, ...row } of data.corrections) {
    requireFact(stories.has(storyId), `correction ${row.id} has no public Story`);
    const list = corrections.get(storyId) ?? [];
    list.push(row);
    corrections.set(storyId, list);
  }
  const imagePaths = new Set(data.media.flatMap(({ manifest }) => manifest.kind === "image" ? manifest.natural.map((file) => file.publicPath) : []));
  for (const row of data.stories) {
    claim(row.href);
    const primary = sections.get(row.section.key);
    const expected = publicStoryPath({ slug: row.slug, sectionSlug: primary?.slug ?? "", publishedAt: row.publishedAt, timeZone: publication.timezone });
    requireFact(expected && row.href === expected && row.url === publication.urls.publicSite.replace(/\/+$/, "") + expected, `Story ${row.id} has an invalid canonical route`);
    requireFact(same(row.section, row.sections[0]), `Story ${row.id} has an inconsistent primary Section`);
    for (const [terms, keys, index] of [[row.sections, row.sectionKeys, sections], [row.topics, row.topicKeys, topics]] as const) {
      requireFact(same(terms.map((term) => term.key), keys) && new Set(keys).size === keys.length && terms.every((term) => {
        const entry = index.get(term.key);
        return entry && term.name === entry.name && term.href === entry.href;
      }), `Story ${row.id} has inconsistent taxonomy`);
    }
    image(row.image);
    if (row.live) {
      const { live } = row;
      requireFact(live.postId === row.id && live.feedUrl === `/_byline/live/${row.id}.json`, `Story ${row.id} live feed differs`);
      requireFact(!live.endedAt || Date.parse(live.endedAt) >= Date.parse(live.startedAt), `Story ${row.id} live coverage ends before it starts`);
      requireFact(new Set(live.updates.map(({ id }) => id)).size === live.updates.length
        && (!live.keyPoints || live.updates.some((update) => same(update, live.keyPoints)))
        && live.updates.every((update) => (!update.image || imagePaths.has(update.image.src)) && (!update.authorPhoto || imagePaths.has(update.authorPhoto.src))),
      `Story ${row.id} has invalid live updates`);
    }
    requireFact(same(row.corrections, corrections.get(row.id) ?? []), `Story ${row.id} corrections differ`);
    requireFact(same(row.contributors.flatMap((entry) => entry.keys), row.contributorKeys) && new Set(row.contributorKeys).size === row.contributorKeys.length, `Story ${row.id} contributor keys differ`);
    for (const entry of row.contributors) {
      const person = people.get(Number(entry.keys[0]?.split(":")[1]));
      requireFact(person && same(entry, publicSnapshotContributor(person)), `Story ${row.id} names an inconsistent contributor ${entry.id}`);
    }
    requireFact(row.titleHtml === escapeHtml(row.title), `Story ${row.id} title HTML differs`);
    requireFact(row.primaryVideo?.videoId === row.videoMetadata?.videoId && (!row.primaryVideo || row.primaryVideo.embedUrl === youTubeEmbedUrl(row.primaryVideo.videoId)), `Story ${row.id} has inconsistent video metadata`);
    if (row.body.format === "legacy-html") continue;
    for (const asset of Object.values(row.body.media)) {
      const item = mediaById.get(Number(asset.id));
      const manifest = item?.manifest;
      const file = manifest?.kind === "image" ? largestNaturalImage(manifest) : manifest?.file;
      const focal = manifest?.kind === "image" ? manifest.focalPoint : null;
      const focalMatches = focal && (focal.x !== 50 || focal.y !== 50) ? same(asset.focalPoint, focal) : asset.focalPoint === undefined;
      requireFact(item && file && focalMatches && asset.src === file.publicPath && asset.kind === item.kind && asset.previewSrc === undefined
        && asset.alt === item.alt && asset.filename === item.filename && asset.credit === mediaCredit(item)
        && asset.mimeType === file.mimeType && asset.filesize === file.bytes
        && asset.width === (manifest?.kind === "image" ? largestNaturalImage(manifest).width : null) && asset.height === (manifest?.kind === "image" ? largestNaturalImage(manifest).height : null),
      `Story ${row.id} body Media ${asset.id} differs from the prepared catalog`);
    }
    for (const [key, reference] of Object.entries(row.body.references?.stories ?? {})) {
      const target = stories.get(Number(key));
      requireFact(target && target.id !== row.id && same(reference, snapshotStoryReference(target)), `Story ${row.id} has inconsistent Related Coverage ${key}`);
    }
    for (const reference of Object.values(row.body.references?.polls ?? {})) {
      requireFact(same(reference, polls.get(reference.id)), `Story ${row.id} has an inconsistent Poll ${reference.id}`);
    }
    for (const node of row.body.nodes) {
      if (node.type === "repositoryInteractive" && options.interactive) requireFact(options.interactive(node.key), `Story ${row.id} uses unregistered interactive ${node.key}`);
    }
  }
  const fixedDestinations = new Set(FIXED_PUBLIC_CONTENT_ROUTES.map(({ path }) => path));
  for (const row of data.redirects) {
    requireFact(!isCodeOwnedPublicPath(row.from), `redirect source ${row.from} is reserved`);
    requireFact(paths.has(row.to) || fixedDestinations.has(row.to), `redirect target ${row.to} has no public record`);
  }
  for (const row of data.redirects) claim(row.from);
  return snapshot;
}

export function publicSnapshotContributor(person: PublicPersonSnapshot): PublicStory<number>["contributors"][number] {
  return {
    keys: [`person:${person.id}`], id: `person-${person.id}-${person.slug}`, name: person.name,
    href: person.hasProfilePage ? `/author/${person.slug}/` : "", role: person.newsroomRole,
    bio: person.status === "guest" ? "" : person.shortBio, photo: person.portrait,
    ...(person.publicEmail ? { contactHref: `mailto:${person.publicEmail}` } : {})
  };
}

export function snapshotStoryReference(story: Pick<PublicStorySnapshot, "id" | "title" | "href" | "section" | "publishedAt" | "image">) {
  return {
    id: story.id, headline: story.title, href: story.href, section: story.section.name, publishedAt: story.publishedAt,
    ...(story.image !== null ? { thumbnail: story.image } : {})
  };
}
