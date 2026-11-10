import { publicPagePaths } from "../page-paths";
import type { PublicBuildSnapshotV3 as PublicBuildSnapshotV2, PublicCorrectionSnapshot } from "@byline/content";
import { escapeHtml } from "@byline/content/story";
import type { Payload } from "payload";
import { relationId } from "../../access/user";
import { publicCoverages } from "../../newsroom/public-coverage";
import { publicPeople } from "../../newsroom/public-people";
import type { Page, Section } from "../../payload-types";
import { correctionPublicFrom } from "../scheduled";
import { pageBodyHtml } from "./page-html";
import { PublicSnapshotError } from "./errors";

export const publicRead = { depth: 0, pagination: false, overrideAccess: true } as const;
export const published = { _status: { equals: "published" } };
export const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export const iso = (value: string) => new Date(value).toISOString();
export const id = (value: unknown) => {
  const result = Number(relationId(value));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
};
export const prose = (value: string) => value.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");

export function taxonomy(row: Pick<Section, "id" | "slug" | "name" | "description">, prefix: "category" | "tag") {
  return { id: row.id, name: text(row.name), slug: row.slug, description: text(row.description), href: prefix === "category" ? `/category/${row.slug}/` : "" };
}

export async function collectPeople(payload: Payload, credited: Set<number>): Promise<PublicBuildSnapshotV2["datasets"]["people"]> {
  const people = await publicPeople(payload);
  return [...people.authors, ...people.guests].filter((person) => person.hasProfilePage || person.directoryVisible || credited.has(person.id)).map(({ href: _href, portrait, ...person }) => ({
    ...person, portrait: portrait?.id ?? null
  })).sort((a, b) => a.id - b.id);
}

export async function collectCollections(payload: Payload, storyIds: Set<number>): Promise<PublicBuildSnapshotV2["datasets"]["collections"]> {
  return (await publicCoverages(payload)).map((entry) => ({
    id: entry.id, slug: entry.slug, title: entry.title, format: entry.format, description: entry.description, overview: entry.overview,
    status: entry.status, artwork: entry.artwork?.id ?? null, modifiedAt: iso(entry.modified),
    ...(entry.startDate ? { startAt: entry.startDate.slice(0, 10) } : {}),
    ...(entry.endDate ? { endAt: entry.endDate.slice(0, 10) } : {}),
    stories: entry.stories.map(({ id }) => id).filter((id) => storyIds.has(id))
  })).sort((a, b) => a.id - b.id);
}

export async function collectCorrections(payload: Payload, storyIds: number[], now: Date): Promise<PublicCorrectionSnapshot[]> {
  if (!storyIds.length) return [];
  const { docs } = await payload.find({ collection: "corrections", where: { story: { in: storyIds } }, ...publicRead,
    select: { story: true, type: true, text: true, date: true, publishedAt: true } });
  return docs.flatMap((row) => {
    const storyId = id(row.story);
    const from = correctionPublicFrom(row);
    return storyId && (from === null || from <= now.getTime()) ? [{ id: String(row.id), storyId, type: row.type, text: text(row.text), date: iso(row.date) }] : [];
  }).sort((a, b) => a.date.localeCompare(b.date) || Number(a.id) - Number(b.id));
}

export async function collectPages(payload: Payload): Promise<PublicBuildSnapshotV2["datasets"]["pages"]> {
  const { docs } = await payload.find({ collection: "pages", draft: false, where: published, ...publicRead, sort: "id",
    select: { title: true, slug: true, parent: true, summary: true, body: true, noindex: true, publishedAt: true, createdAt: true, updatedAt: true, deletedAt: true } });
  const pages = docs.filter((row) => !row.deletedAt);
  let paths: Map<number, string>;
  try {
    paths = publicPagePaths(pages);
  } catch (error) {
    throw new PublicSnapshotError("invalid-projection", (error as Error).message);
  }
  return pages.map((row) => ({
    id: row.id, title: text(row.title), slug: row.slug, href: paths.get(row.id)!, summary: text(row.summary),
    bodyHtml: pageBodyHtml(row.body, row), indexing: row.noindex ? "noindex" : "public",
    publishedAt: iso(row.publishedAt ?? row.createdAt), modifiedAt: iso(row.updatedAt)
  }));
}

export async function collectEvents(payload: Payload): Promise<PublicBuildSnapshotV2["datasets"]["events"]> {
  const { docs } = await payload.find({ collection: "events", draft: false, where: published, ...publicRead,
    select: { title: true, slug: true, eventType: true, startAt: true, endAt: true, allDay: true, location: true, description: true, externalUrl: true, eventStatus: true } });
  return docs.map((row) => ({
    id: row.id, title: text(row.title), slug: row.slug, type: text(row.eventType), startAt: iso(row.startAt),
    endAt: row.endAt ? iso(row.endAt) : null, allDay: row.allDay === true, location: text(row.location),
    description: text(row.description), externalUrl: text(row.externalUrl), status: row.eventStatus
  })).sort((a, b) => a.startAt.localeCompare(b.startAt) || a.id - b.id);
}
