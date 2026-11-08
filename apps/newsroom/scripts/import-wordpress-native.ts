/**
 * Import the read-only JSON produced by migration/export-wordpress-native.php
 * as real Payload/Byline records. There is no legacy-html fallback: an
 * unsupported or incomplete native conversion is an error.
 *
 * Dry run (default):
 *   npm run import:wordpress --workspace @byline/newsroom -- --file /migration/wordpress-native.json --map-person 1:gibson
 *
 * Apply:
 *   npm run import:wordpress --workspace @byline/newsroom -- --file /migration/wordpress-native.json --map-person 1:gibson --apply
 *
 * Explicitly omit a permanently lost WordPress media asset:
 *   --omit-media WP_ATTACHMENT_ID
 */
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import sharp from "sharp";
import { parseYouTubeVideoId, youTubeWatchUrl } from "@byline/core";
import { publicStoryPath } from "@byline/content";
import type { ArticleBody, ArticleBodyNode, ArticleBlock } from "@byline/article-body";
import { lexicalFromArticleBody } from "@byline/editor/serialize";
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction } from "payload";
import config from "../src/payload.config";
import { recordPublicMutation } from "../src/public/revision";
import { CORRECTION_TYPES } from "../src/domain/vocabulary";
import { MEDIA_MIME_TYPES, MEDIA_UPLOAD_MAX_BYTES } from "../src/collections/Media";
import { localToInstant, newsroomTimeZone } from "../src/domain/dates";
import { isWorkflowStage } from "../src/domain/workflow";
import { RESOURCE_PURPOSES } from "../src/domain/vocabulary";

type ExportPerson = {
  id: number;
  name: string;
  slug: string;
  pronouns?: string;
  newsroomRole?: string;
  shortBio?: string;
  bio?: string;
  portraitId?: number | null;
  directoryVisible?: boolean;
  publicEmail?: string;
  socials?: Array<{ label: string; url: string }>;
};
type ExportGuest = ExportPerson & { hasProfilePage?: boolean; status?: string };
type ExportTerm = { id: number; name: string; slug: string; description?: string };
type ExportAttachment = {
  id: number; url: string; candidateUrls?: string[]; inlineDataBase64?: string | null; inlineBytes?: number | null; filename: string; mimeType: string; alt?: string; caption?: string;
  creator?: string; credit?: string; copyright?: string; license?: string; sourceUrl?: string;
  capturedAt?: string; artDirection?: unknown; recoveredFromBlock?: boolean;
};
type ExportCorrection = { legacyId?: number | null; type: string; text: string; date: string; source?: string };
type ExportPost = {
  id: number; title: string; slug: string; status: "publish" | "draft"; publicPath?: string;
  createdLocal?: string; publishedLocal?: string; modifiedLocal?: string; publishedGmt?: string; modifiedGmt?: string;
  deck?: string; featuredMediaId?: number | null; featuredCaption?: string; categoryIds: number[]; tagIds: number[];
  contributors: Array<{ type: "user" | "guest"; id: number }>;
  reportingNote?: string; format?: string; videoUrl?: string; presentation?: string; immersiveAlignment?: string;
  body: ArticleBody; corrections?: ExportCorrection[];
  plan?: {
    workflow?: string;
    editorUserId?: number | null;
    deadline?: string;
    visuals?: string;
    plannedPublication?: string;
    brief?: string;
    resources?: Array<{ label: string; url: string; purpose: string }>;
  };
};
type WordPressExport = {
  schemaVersion: number; generatedAt: string; siteUrl: string;
  users: ExportPerson[]; guests: ExportGuest[]; categories: ExportTerm[]; tags: ExportTerm[];
  attachments: ExportAttachment[]; posts: ExportPost[]; warnings?: string[]; errors?: string[];
};

type Summary = {
  media: { create: number; reuse: number; omitted: number };
  people: { create: number; reuse: number; mapped: number };
  sections: { create: number; reuse: number };
  topics: { create: number; reuse: number };
  stories: { create: number; update: number; published: number; drafts: number };
  corrections: { create: number; update: number; reuse: number };
  review: string[];
};

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
function argument(name: string): string | null {
  const inline = argv.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? null : null;
}
function repeated(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value.startsWith(`${name}=`)) values.push(value.slice(name.length + 1));
    else if (value === name && argv[index + 1]) values.push(argv[++index]);
  }
  return values;
}
const file = argument("--file");
if (!file) {
  console.error("Usage: import-wordpress-native.ts --file <export.json> [--map-person WP_ID:PAYLOAD_ID_OR_SLUG] [--omit-media WP_ATTACHMENT_ID] [--apply]");
  process.exit(64);
}

const mappings = new Map<number, string>();
for (const value of repeated("--map-person")) {
  const [wp, target] = value.split(":", 2);
  const id = Number(wp);
  if (!Number.isSafeInteger(id) || id <= 0 || !target) throw new Error(`Invalid --map-person ${value}; expected WP_ID:PAYLOAD_ID_OR_SLUG.`);
  mappings.set(id, target);
}

const omittedMedia = new Set<number>();
for (const value of repeated("--omit-media")) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid --omit-media ${value}; expected a positive WordPress attachment ID.`);
  omittedMedia.add(id);
}

const raw = JSON.parse(await readFile(file, "utf8")) as WordPressExport;
if (raw.schemaVersion !== 1) throw new Error(`Unsupported WordPress export schema ${raw.schemaVersion}.`);
if ((raw.errors ?? []).length) throw new Error(`WordPress export cannot be imported natively:\n- ${raw.errors!.join("\n- ")}`);
if (!Array.isArray(raw.posts) || !Array.isArray(raw.attachments) || !Array.isArray(raw.users)) throw new Error("Malformed WordPress export.");

const payload = await getPayload({ config });
const summary: Summary = {
  media: { create: 0, reuse: 0, omitted: 0 },
  people: { create: 0, reuse: 0, mapped: 0 },
  sections: { create: 0, reuse: 0 },
  topics: { create: 0, reuse: 0 },
  stories: { create: 0, update: 0, published: raw.posts.filter((post) => post.status === "publish").length, drafts: raw.posts.filter((post) => post.status === "draft").length },
  corrections: { create: 0, update: 0, reuse: 0 },
  review: [...(raw.warnings ?? [])],
};

const isHttps = (value: unknown): value is string => typeof value === "string" && /^https:\/\/\S+$/i.test(value);
const isHttpUrl = (value: unknown): value is string => typeof value === "string" && /^https?:\/\/\S+$/i.test(value);
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const importContext = { bylineImport: true };
const CONVERTIBLE_IMAGE_MIME_TYPES = new Set(["image/heic", "image/heif"]);
function importMediaTarget(attachment: ExportAttachment) {
  const sourceMime = text(attachment.mimeType).toLowerCase();
  if ((MEDIA_MIME_TYPES as readonly string[]).includes(sourceMime)) {
    return { sourceMime, targetMime: sourceMime, filename: attachment.filename || basename(new URL(attachment.url).pathname), convertToJpeg: false };
  }
  if (CONVERTIBLE_IMAGE_MIME_TYPES.has(sourceMime)) {
    const sourceName = attachment.filename || basename(new URL(attachment.url).pathname) || `wordpress-media-${attachment.id}`;
    const extension = extname(sourceName);
    const stem = extension ? sourceName.slice(0, -extension.length) : sourceName;
    return { sourceMime, targetMime: "image/jpeg", filename: `${stem || `wordpress-media-${attachment.id}`}.jpg`, convertToJpeg: true };
  }
  throw new Error(`Attachment ${attachment.id} has unsupported MIME type ${attachment.mimeType}.`);
}

const EDITORIAL_ONLY_TAG_SLUGS = new Set(["special-coverage", "athlete-of-the-week", "athlete-of-the-month"]);
const publicTopicTerms = raw.tags.filter((term) => !EDITORIAL_ONLY_TAG_SLUGS.has(term.slug));
const categoryById = new Map(raw.categories.map((term) => [term.id, term]));
function sectionWordPressId(post: ExportPost): number | null {
  const candidates = post.categoryIds.filter((id) => categoryById.get(id)?.slug !== "uncategorized");
  const match = text(post.publicPath).match(/^\/\d{4}\/\d{2}\/\d{2}\/([^/]+)\/[^/]+\/$/);
  if (match) {
    const exact = candidates.find((id) => categoryById.get(id)?.slug === match[1]);
    if (exact) return exact;
  }
  return candidates[0] ?? null;
}

async function one(collection: any, where: Record<string, unknown>) {
  const result = await payload.find({
    collection,
    where,
    depth: 0,
    limit: 2,
    overrideAccess: true,
    ...(collection === "stories" ? { trash: true } : {}),
  } as never);
  if (result.totalDocs > 1) throw new Error(`Import identity is ambiguous in ${collection}: ${JSON.stringify(where)}`);
  return result.docs[0] as any | undefined;
}

async function byLegacy(collection: any, id: number, field = "legacyWordPressId") {
  return one(collection, { [field]: { equals: id } });
}

async function bySlug(collection: any, slug: string) {
  return one(collection, { slug: { equals: slug } });
}

async function resolveMappedPerson(target: string) {
  const numeric = Number(target);
  if (Number.isSafeInteger(numeric) && numeric > 0) {
    return payload.findByID({ collection: "people", id: numeric, depth: 0, overrideAccess: true });
  }
  const person = await bySlug("people", target);
  if (!person) throw new Error(`Mapped Byline Person "${target}" does not exist.`);
  return person;
}

async function accountForPerson(personId: number) {
  const result = await payload.find({
    collection: "users",
    where: { linkedPerson: { equals: personId } },
    depth: 0,
    limit: 2,
    overrideAccess: true,
  });
  if (result.totalDocs > 1) throw new Error(`Person ${personId} has multiple sign-in accounts; expected at most one.`);
  return result.docs[0] as any | undefined;
}

async function mappedEditorAccount(wordPressUserId: number) {
  const target = mappings.get(wordPressUserId);
  if (!target) return undefined;
  const person = await resolveMappedPerson(target);
  return accountForPerson(Number(person.id));
}

function normalizeSocials(value: ExportPerson["socials"]) {
  return (value ?? []).filter((row) => row && text(row.label) && isHttps(row.url)).slice(0, 8)
    .map((row) => ({ label: text(row.label).slice(0, 40), url: row.url }));
}

function mapMediaInNode(node: any, media: Map<number, number>): any | null {
  const mapped = (value: unknown) => typeof value === "number" ? (media.get(value) ?? null) : value;
  const omitted = (value: unknown) => typeof value === "number" && omittedMedia.has(value);

  if (node.type === "photo") {
    if (omitted(node.media)) return null;
    return { ...node, media: mapped(node.media) };
  }
  if (node.type === "gallery") {
    const items = (node.items ?? [])
      .filter((item: any) => !omitted(item.media))
      .map((item: any) => ({ ...item, media: mapped(item.media) }));
    return items.length ? { ...node, items } : null;
  }
  if (["document", "portraitText", "visualChapter", "audio", "annotatedImage"].includes(node.type)) {
    if (omitted(node.media)) return null;
    return { ...node, media: mapped(node.media) };
  }
  if (node.type === "chartMap") {
    return { ...node, image: omitted(node.image) ? null : mapped(node.image) };
  }
  if (node.type === "beforeAfter") {
    if (omitted(node.before) || omitted(node.after)) return null;
    return { ...node, before: mapped(node.before), after: mapped(node.after) };
  }
  if (node.type === "video" && typeof node._sourceUrl === "string") {
    const videoId = parseYouTubeVideoId(node._sourceUrl);
    if (!videoId) throw new Error(`Invalid imported YouTube URL: ${node._sourceUrl}`);
    const { _sourceUrl: _drop, ...rest } = node;
    return { ...rest, videoId };
  }
  return node;
}

function nativeBody(body: ArticleBody, media: Map<number, number>): ArticleBody {
  if (body?.format !== "byline-v1" || body.version !== 1 || !Array.isArray(body.nodes)) throw new Error("Export contains a non-native article body.");
  const nodes = body.nodes
    .map((node) => mapMediaInNode(node, media))
    .filter((node): node is ArticleBodyNode => node !== null);
  return { ...body, nodes, media: {} };
}

async function download(attachment: ExportAttachment) {
  const target = importMediaTarget(attachment);
  const source = await fetchAttachmentSource(attachment, false);
  let data = source.data!;
  if (!data.length) throw new Error(`Attachment ${attachment.id} is empty.`);
  if (target.convertToJpeg) {
    try {
      data = await sharp(data).autoOrient().jpeg({ quality: 92 }).toBuffer();
    } catch (error) {
      throw new Error(`Attachment ${attachment.id} could not be converted from ${target.sourceMime} to JPEG: ${(error as Error).message}`);
    }
  }
  if (data.length > MEDIA_UPLOAD_MAX_BYTES) throw new Error(`Attachment ${attachment.id} is larger than Byline's upload limit after import processing.`);
  return { data, mimetype: target.targetMime, name: target.filename, size: data.length };
}

async function plan() {
  const exportedAttachmentIds = new Set(raw.attachments.map((attachment) => attachment.id));
  for (const id of omittedMedia) {
    if (!exportedAttachmentIds.has(id)) throw new Error(`--omit-media ${id} does not exist in the WordPress export.`);
  }

  for (const attachment of raw.attachments) {
    if (omittedMedia.has(attachment.id)) {
      summary.media.omitted++;
      summary.review.push(`Attachment ${attachment.id}: explicitly omitted because the WordPress source is permanently unavailable; affected Story media blocks/items will be removed.`);
      continue;
    }
    const target = importMediaTarget(attachment);
    if (target.convertToJpeg) summary.review.push(`Attachment ${attachment.id}: ${target.sourceMime} will be converted to JPEG for Byline Media.`);
    if (attachment.recoveredFromBlock) {
      const source = await fetchAttachmentSource(attachment, true);
      if (source.url === "wordpress-upload-volume") {
        summary.review.push(`Attachment ${attachment.id}: orphaned WordPress media will be imported from bytes recovered directly from the uploads volume.`);
      } else if (source.url !== attachment.url) {
        summary.review.push(`Attachment ${attachment.id}: stale primary URL is unavailable; a Gutenberg srcset/source candidate will be used instead.`);
      }
    }
  }
  for (const attachment of raw.attachments) {
    if (omittedMedia.has(attachment.id)) continue;
    if (await byLegacy("media", attachment.id)) summary.media.reuse++;
    else summary.media.create++;
  }

  for (const person of raw.users) {
    const mapping = mappings.get(person.id);
    const existing = await byLegacy("people", person.id);
    if (mapping) {
      const target = await resolveMappedPerson(mapping);
      if (existing && Number(existing.id) !== Number(target.id)) throw new Error(`WordPress user ${person.id} already belongs to another imported Person.`);
      if (target.legacyWordPressId && Number(target.legacyWordPressId) !== person.id) throw new Error(`Mapped Person ${target.id} already has legacyWordPressId ${target.legacyWordPressId}.`);
      summary.people.mapped++;
    } else if (existing) summary.people.reuse++;
    else {
      const collision = await bySlug("people", person.slug);
      if (collision) throw new Error(`WordPress user ${person.id} (${person.name}) collides with existing Person slug "${person.slug}". Re-run with --map-person ${person.id}:${collision.id}.`);
      summary.people.create++;
    }
  }
  for (const guest of raw.guests) {
    if (await byLegacy("people", guest.id, "legacyGuestId")) summary.people.reuse++;
    else {
      const collision = await bySlug("people", guest.slug);
      if (collision) throw new Error(`Guest ${guest.id} (${guest.name}) collides with existing Person slug "${guest.slug}".`);
      summary.people.create++;
    }
  }
  for (const term of raw.categories) (await byLegacy("sections", term.id) || await bySlug("sections", term.slug)) ? summary.sections.reuse++ : summary.sections.create++;
  for (const term of publicTopicTerms) (await byLegacy("topics", term.id) || await bySlug("topics", term.slug)) ? summary.topics.reuse++ : summary.topics.create++;
  for (const post of raw.posts) (await byLegacy("stories", post.id)) ? summary.stories.update++ : summary.stories.create++;
  for (const post of raw.posts) {
    for (const correction of post.corrections ?? []) {
      const type = normalizeCorrectionType(correction.type);
      const date = correctionInstant(correction.date);
      const story = await byLegacy("stories", post.id);
      let existing = correction.legacyId ? await byLegacy("corrections", correction.legacyId) : undefined;
      if (!existing && story) existing = await one("corrections", { and: [
        { story: { equals: story.id } }, { type: { equals: type } }, { date: { equals: date } }, { text: { equals: correction.text } },
      ] });
      if (!existing) summary.corrections.create++;
      else if (correction.legacyId && !existing.legacyWordPressId) summary.corrections.update++;
      else summary.corrections.reuse++;
    }
  }

  const knownAttachments = new Set(raw.attachments.map((item) => item.id));
  const referencedOmissions = new Set<number>();
  for (const post of raw.posts) {
    if (!text(post.publishedLocal) || !text(post.modifiedLocal)) {
      throw new Error(`Post ${post.id} is missing WordPress-local publication timestamps; regenerate the export with the current exporter.`);
    }
    // Validate conversion now, not during apply.
    localToInstant(text(post.publishedLocal), newsroomTimeZone());
    localToInstant(text(post.modifiedLocal), newsroomTimeZone());
    const inspect = (node: any) => {
      const ids: number[] = [];
      if (typeof node.media === "number") ids.push(node.media);
      if (typeof node.image === "number") ids.push(node.image);
      if (typeof node.before === "number") ids.push(node.before);
      if (typeof node.after === "number") ids.push(node.after);
      for (const item of node.items ?? []) if (typeof item.media === "number") ids.push(item.media);
      for (const id of ids) {
        if (!knownAttachments.has(id)) throw new Error(`Post ${post.id} references attachment ${id}, which is missing from the export.`);
        if (omittedMedia.has(id)) referencedOmissions.add(id);
      }
    };
    post.body.nodes.forEach(inspect);
    if (post.featuredMediaId) {
      if (!knownAttachments.has(post.featuredMediaId)) throw new Error(`Post ${post.id} featured image ${post.featuredMediaId} is missing from the export.`);
      if (omittedMedia.has(post.featuredMediaId)) referencedOmissions.add(post.featuredMediaId);
    }
    const sectionId = sectionWordPressId(post);
    const section = sectionId ? categoryById.get(sectionId) : null;
    if (post.status === "publish") {
      if (!section) throw new Error(`Published post ${post.id} has no visible WordPress category for its Payload Section.`);
      const publishedAt = localToInstant(text(post.publishedLocal), newsroomTimeZone());
      const expected = publicStoryPath({ slug: post.slug, sectionSlug: section.slug, publishedAt, timeZone: newsroomTimeZone() });
      if (text(post.publicPath) && expected !== post.publicPath) {
        throw new Error(`Post ${post.id} URL parity failed: WordPress ${post.publicPath}, Payload would use ${expected || "(no route)"}.`);
      }
    }
    const editorialTags = post.tagIds.map((id) => raw.tags.find((term) => term.id === id)?.slug).filter((slug): slug is string => Boolean(slug && EDITORIAL_ONLY_TAG_SLUGS.has(slug)));
    if (editorialTags.length) summary.review.push(`Post ${post.id}: editorial-only WordPress tag(s) omitted from public Topics: ${editorialTags.join(", ")}.`);
    const plan = importedPlan(post);
    if (plan.oldEditorUserId) {
      const account = await mappedEditorAccount(plan.oldEditorUserId);
      if (!account) summary.review.push(`Post ${post.id}: old WordPress editor user ${plan.oldEditorUserId} has no mapped Byline sign-in account, so the editor assignment will be left blank.`);
    }
    if (plan.oldVisualNeeds) summary.review.push(`Post ${post.id}: old visual-needs note has no direct Payload field and needs review: ${plan.oldVisualNeeds.slice(0, 180)}`);
  }
  for (const id of omittedMedia) {
    if (!referencedOmissions.has(id)) throw new Error(`--omit-media ${id} is not referenced by any imported Story body or featured image.`);
  }
}

const correctionTypes = new Map<string, (typeof CORRECTION_TYPES)[number]>([
  ["correction", "correction"], ["clarification", "clarification"], ["editor-note", "editor-note"],
  ["editors-note", "editor-note"], ["update", "substantive-update"], ["substantive-update", "substantive-update"],
]);
function normalizeCorrectionType(value: string) {
  const type = correctionTypes.get(value);
  if (!type) throw new Error(`Unknown correction type ${value}.`);
  return type;
}
function correctionInstant(value: string) {
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const time = Date.parse(candidate);
  if (!Number.isFinite(time)) throw new Error(`Invalid correction date ${value}.`);
  return new Date(time).toISOString();
}

const resourcePurposes = new Set<string>(RESOURCE_PURPOSES);
function importedPlan(post: ExportPost) {
  const plan = post.plan ?? {};
  const workflow = isWorkflowStage(plan.workflow) ? plan.workflow : "pitch";
  const deadline = text(plan.deadline);
  if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error(`Post ${post.id} has invalid deadline ${deadline}.`);
  const planned = text(plan.plannedPublication);
  if (planned && !Number.isFinite(Date.parse(planned))) throw new Error(`Post ${post.id} has invalid planned publication ${planned}.`);
  const resources = (plan.resources ?? []).map((resource) => {
    const label = text(resource.label).slice(0, 120);
    const url = text(resource.url);
    const purpose = resourcePurposes.has(resource.purpose) ? resource.purpose : "other";
    if (!label || !isHttpUrl(url)) throw new Error(`Post ${post.id} has an invalid private resource link.`);
    const parsed = new URL(url);
    if (parsed.username || parsed.password) throw new Error(`Post ${post.id} has a private resource URL with credentials.`);
    return { label, url, purpose };
  });
  return {
    workflow,
    deadline: deadline || null,
    plannedPublication: planned ? new Date(planned).toISOString() : null,
    brief: text(plan.brief).slice(0, 4000),
    resources,
    oldEditorUserId: Number(plan.editorUserId) > 0 ? Number(plan.editorUserId) : null,
    oldVisualNeeds: text(plan.visuals),
  };
}

async function applyImport() {
  const mediaMap = new Map<number, number>();
  for (const attachment of raw.attachments) {
    if (omittedMedia.has(attachment.id)) continue;
    const mediaData = {
      legacyWordPressId: attachment.id,
      alt: text(attachment.alt).slice(0, 600),
      creator: text(attachment.creator).slice(0, 160),
      credit: text(attachment.credit).slice(0, 200),
      copyright: text(attachment.copyright).slice(0, 200),
      license: text(attachment.license).slice(0, 200),
      sourceUrl: text(attachment.sourceUrl).slice(0, 2000),
      capturedAt: text(attachment.capturedAt) || null,
      artDirection: attachment.artDirection ?? undefined,
    };
    let doc = await byLegacy("media", attachment.id);
    if (!doc) {
      const file = await download(attachment);
      doc = await payload.create({ collection: "media", data: mediaData as never, file, overrideAccess: true, context: importContext });
    } else {
      doc = await payload.update({ collection: "media", id: doc.id, data: mediaData as never, overrideAccess: true, context: importContext });
    }
    mediaMap.set(attachment.id, Number(doc.id));
  }

  const peopleMap = new Map<string, number>();
  for (const person of raw.users) {
    const key = `user:${person.id}`;
    const mapping = mappings.get(person.id);
    let doc = await byLegacy("people", person.id);
    if (mapping) {
      doc = await resolveMappedPerson(mapping);
      if (!doc.legacyWordPressId) {
        doc = await payload.update({ collection: "people", id: doc.id, data: { legacyWordPressId: person.id } as never, overrideAccess: true, context: importContext });
      }
    } else {
      const personData = {
        legacyWordPressId: person.id, name: person.name, slug: person.slug, pronouns: text(person.pronouns),
        newsroomRole: text(person.newsroomRole), shortBio: text(person.shortBio), bio: text(person.bio),
        portrait: person.portraitId ? mediaMap.get(person.portraitId) ?? null : null,
        status: "active", directoryVisible: person.directoryVisible !== false, hasProfilePage: true,
        publicEmail: text(person.publicEmail) || null, socials: normalizeSocials(person.socials),
      };
      doc = doc
        ? await payload.update({ collection: "people", id: doc.id, data: personData as never, overrideAccess: true, context: importContext })
        : await payload.create({ collection: "people", data: personData as never, overrideAccess: true, context: importContext });
    }
    peopleMap.set(key, Number(doc.id));
  }
  for (const guest of raw.guests) {
    const key = `guest:${guest.id}`;
    let doc = await byLegacy("people", guest.id, "legacyGuestId");
    const guestData = {
      legacyGuestId: guest.id, name: guest.name, slug: guest.slug, newsroomRole: text(guest.newsroomRole),
      bio: text(guest.bio), shortBio: "", portrait: guest.portraitId ? mediaMap.get(guest.portraitId) ?? null : null,
      status: "guest", directoryVisible: Boolean(guest.hasProfilePage), hasProfilePage: Boolean(guest.hasProfilePage),
      socials: normalizeSocials(guest.socials),
    };
    doc = doc
      ? await payload.update({ collection: "people", id: doc.id, data: guestData as never, overrideAccess: true, context: importContext })
      : await payload.create({ collection: "people", data: guestData as never, overrideAccess: true, context: importContext });
    peopleMap.set(key, Number(doc.id));
  }

  const editorAccountMap = new Map<number, number>();
  for (const person of raw.users) {
    const personId = peopleMap.get(`user:${person.id}`);
    if (!personId) continue;
    const account = await accountForPerson(personId);
    if (account) editorAccountMap.set(person.id, Number(account.id));
  }

  const sectionMap = new Map<number, number>();
  for (const term of raw.categories) {
    let doc = await byLegacy("sections", term.id) ?? await bySlug("sections", term.slug);
    const data = { legacyWordPressId: term.id, name: term.name, slug: term.slug, description: text(term.description), hidden: term.slug === "uncategorized" };
    doc = doc
      ? await payload.update({ collection: "sections", id: doc.id, data: data as never, overrideAccess: true, context: importContext })
      : await payload.create({ collection: "sections", data: data as never, overrideAccess: true, context: importContext });
    sectionMap.set(term.id, Number(doc.id));
  }
  const topicMap = new Map<number, number>();
  for (const term of publicTopicTerms) {
    let doc = await byLegacy("topics", term.id) ?? await bySlug("topics", term.slug);
    const data = { legacyWordPressId: term.id, name: term.name, slug: term.slug, description: text(term.description) };
    doc = doc
      ? await payload.update({ collection: "topics", id: doc.id, data: data as never, overrideAccess: true, context: importContext })
      : await payload.create({ collection: "topics", data: data as never, overrideAccess: true, context: importContext });
    topicMap.set(term.id, Number(doc.id));
  }

  const storyMap = new Map<number, number>();
  for (const post of raw.posts) {
    const body = nativeBody(post.body, mediaMap);
    const lexical = lexicalFromArticleBody(body);
    const categoryId = sectionWordPressId(post);
    const section = categoryId ? sectionMap.get(categoryId) ?? null : null;
    const contributors = post.contributors.map((ref) => peopleMap.get(`${ref.type}:${ref.id}`)).filter((id): id is number => Number.isSafeInteger(id));
    if (contributors.length !== post.contributors.length) throw new Error(`Post ${post.id} has a contributor that was not imported.`);
    const format = post.format === "video" ? "video" : "standard";
    const primaryVideoId = format === "video" ? parseYouTubeVideoId(post.videoUrl) : null;
    const data = {
      legacyWordPressId: post.id,
      headline: post.title,
      deck: text(post.deck),
      slug: post.slug,
      _status: post.status === "publish" ? "published" : "draft",
      ...(post.status === "publish" ? { publishedAt: localToInstant(text(post.publishedLocal), newsroomTimeZone()) } : {}),
      section,
      topics: post.tagIds.map((id) => topicMap.get(id)).filter((id): id is number => Boolean(id)),
      contributors,
      featuredMedia: post.featuredMediaId && !omittedMedia.has(post.featuredMediaId) ? mediaMap.get(post.featuredMediaId) ?? null : null,
      featuredCaption: text(post.featuredCaption),
      contentFormat: "byline-v1",
      body: lexical,
      format,
      video: { url: primaryVideoId ? youTubeWatchUrl(primaryVideoId) : text(post.videoUrl), metadata: null },
      presentation: post.presentation === "immersive" ? "immersive" : "standard",
      immersiveAlignment: post.immersiveAlignment === "center" ? "center" : "bottom-left",
      reportingNote: text(post.reportingNote),
    };
    let story = await byLegacy("stories", post.id);
    if (story) {
      story = await payload.update({ collection: "stories", id: story.id, data: data as never, draft: post.status !== "publish", overrideAccess: true, context: importContext });
    } else {
      story = await payload.create({ collection: "stories", data: data as never, draft: post.status !== "publish", overrideAccess: true, context: importContext });
    }
    storyMap.set(post.id, Number(story.id));

    const createdAt = localToInstant(text(post.createdLocal || post.publishedLocal), newsroomTimeZone());
    const modifiedAt = localToInstant(text(post.modifiedLocal || post.createdLocal || post.publishedLocal), newsroomTimeZone());
    // Payload owns these generated fields for normal writes. The controlled
    // import restores source timestamps directly on the main row so public
    // modifiedAt does not become the migration time. The first ordinary
    // Byline edit will naturally advance updatedAt again.
    await payload.db.updateOne({
      collection: "stories",
      id: story.id,
      data: { createdAt, updatedAt: modifiedAt } as never,
    });

    const planInput = importedPlan(post);
    const plans = await payload.find({
      collection: "story-plans",
      where: { story: { equals: story.id } },
      depth: 0,
      limit: 2,
      overrideAccess: true,
    });
    if (plans.totalDocs !== 1) throw new Error(`Story ${post.id} has ${plans.totalDocs} Payload plans after import; expected exactly one.`);
    await payload.update({
      collection: "story-plans",
      id: plans.docs[0].id,
      data: {
        workflow: planInput.workflow,
        editor: planInput.oldEditorUserId ? editorAccountMap.get(planInput.oldEditorUserId) ?? null : null,
        deadline: planInput.deadline,
        plannedPublication: planInput.plannedPublication,
        brief: planInput.brief,
        resources: planInput.resources,
      } as never,
      overrideAccess: true,
      context: importContext,
    });
  }

  for (const post of raw.posts) {
    const story = storyMap.get(post.id)!;
    for (const correction of post.corrections ?? []) {
      const type = normalizeCorrectionType(correction.type);
      if (!text(correction.text)) continue;
      const date = correctionInstant(correction.date);
      let existing = correction.legacyId ? await byLegacy("corrections", correction.legacyId) : undefined;
      if (!existing) {
        existing = await one("corrections", { and: [
          { story: { equals: story } }, { type: { equals: type } }, { date: { equals: date } }, { text: { equals: correction.text } },
        ] });
      }
      const correctionData = { legacyWordPressId: correction.legacyId ?? existing?.legacyWordPressId ?? undefined, story, type, text: correction.text, date, publishedAt: null, createdBy: null };
      if (existing) {
        await payload.update({ collection: "corrections", id: existing.id, data: correctionData as never, overrideAccess: true, context: importContext });
      } else {
        await payload.create({ collection: "corrections", data: correctionData as never, overrideAccess: true, context: importContext });
      }
    }
  }

  // Controlled imports suppress per-record public revisions. Queue exactly one
  // new snapshot after the whole idempotent import is complete.
  const req = await createLocalReq({}, payload);
  const owns = await initTransaction(req);
  try {
    await recordPublicMutation(req, "native WordPress import", { force: true });
    if (owns) await commitTransaction(req);
  } catch (error) {
    if (owns) await killTransaction(req);
    throw error;
  }
}

try {
  await plan();
  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    export: { generatedAt: raw.generatedAt, siteUrl: raw.siteUrl, posts: raw.posts.length, attachments: raw.attachments.length },
    summary,
  }, null, 2));
  if (!apply) {
    console.log("\nDry run only. Re-run with --apply after reviewing this report.");
  } else {
    await applyImport();
    console.log("\nNative WordPress import complete.");
  }
} finally {
  await payload.destroy();
}
