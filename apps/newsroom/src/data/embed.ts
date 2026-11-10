import { dataProjectPath } from "@byline/data";
import type { DataProjectChoice } from "@byline/editor/data-project";
import { createLocalReq, type Payload, type PayloadRequest } from "payload";
import { relationId } from "../access/user";
import { projectPublicationIssues, storedRelease } from "./collections";
import { dataPresentationDescriptor } from "./registry";

/**
 * Data Projects inside Stories (docs/byline-data.md#story-embeds).
 *
 * A Story's `dataProject` block stores only a project ID and the story's own
 * heading and description. Everything here answers questions ABOUT the project
 * for the editor and for publication; nothing is ever copied into a Story:
 *
 *   choices    what the Story picker lists (small, per signed-in account)
 *   published  which project IDs have a valid public representation
 *   usage      which published Stories embed a project (blocks unpublish/delete)
 */

const system = { depth: 0, pagination: false, overrideAccess: true } as const;

/**
 * Project IDs that can be embedded in a published Story: the MAIN (published)
 * row exists, its presentation is registered, and its bindings, settings and
 * address still satisfy the presentation against the datasets' current
 * releases. A project that merely has unpublished edits is still embeddable:
 * readers get its published version. Anything else (missing, deleted, never
 * published, invalid) is absent from the result.
 */
export async function embeddableDataProjects(payload: Payload, ids: readonly number[], req?: PayloadRequest): Promise<Set<number>> {
  const wanted = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!wanted.length) return new Set();
  const request = req ?? (await createLocalReq({}, payload));
  const { docs } = await payload.find({ collection: "data-projects", draft: false, where: { and: [{ id: { in: wanted } }, { _status: { equals: "published" } }] }, ...system, req: request });
  const usable = new Set<number>();
  for (const project of docs) {
    if (!dataPresentationDescriptor(String(project.presentation ?? ""))) continue;
    if ((await projectPublicationIssues(request, project as unknown as Record<string, unknown>)).length) continue;
    usable.add(project.id);
  }
  return usable;
}

type ProjectRow = { id: number; title: string; slug: string; deck?: string | null; presentation: string; presentationKind: "template" | "custom"; updatedAt: string; publishedAt?: string | null; _status?: "draft" | "published" | null };

/** The quiet facts the picker needs. Never bindings, settings, rows or release hashes. */
export function dataProjectChoice(latest: ProjectRow, main: ProjectRow | undefined, options: { site: string; dataUpdatedAt: string | null }): DataProjectChoice {
  const published = main?._status === "published";
  const changed = published && latest._status === "draft" && Date.parse(latest.updatedAt) > Date.parse(main!.updatedAt);
  const descriptor = dataPresentationDescriptor(latest.presentation);
  return {
    id: latest.id,
    title: latest.title,
    deck: latest.deck ?? "",
    publication: !published ? "draft" : changed ? "changed" : "published",
    presentation: { key: latest.presentation, kind: latest.presentationKind, name: descriptor?.name ?? latest.presentation },
    publishedAt: published ? main!.publishedAt ?? null : null,
    dataUpdatedAt: options.dataUpdatedAt,
    publicUrl: published ? `${options.site}${dataProjectPath(main!.slug)}` : null
  };
}

/** The newest release a project's bound datasets currently have, as "Data updated" shows it. */
export async function dataUpdatedAtFor(payload: Payload, bindings: unknown, req: PayloadRequest): Promise<string | null> {
  const keys = [...new Set((Array.isArray(bindings) ? bindings : []).flatMap((binding) => (binding && typeof binding === "object" && typeof (binding as { dataset?: unknown }).dataset === "string" ? [(binding as { dataset: string }).dataset] : [])))];
  if (!keys.length) return null;
  const { docs } = await payload.find({ collection: "data-datasets", where: { key: { in: keys } }, select: { release: true }, req, overrideAccess: false, depth: 0, pagination: false });
  const dates = docs.flatMap((dataset) => storedRelease(dataset.release)?.descriptor.releasedAt ?? []);
  return dates.length ? dates.sort().at(-1)! : null;
}

export const projectIdOf = (value: unknown): number => Number(relationId(value));
