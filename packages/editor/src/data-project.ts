import type { MediaId } from "@byline/article-body";

/**
 * Data Project choices as the Story editor knows them. Pure and framework
 * free: the picker, the canvas and the tests read the same rules. A block
 * stores only the project's ID and this story's own heading and description;
 * everything below is a host's answer about the project, never stored.
 */

/**
 * `draft`: never published. `published`: readers see what the project shows
 * now. `changed`: published, with unpublished edits (readers still see the
 * published version).
 */
export type DataProjectPublication = "draft" | "published" | "changed";

export type DataProjectChoice = {
  id: number;
  title: string;
  deck: string;
  publication: DataProjectPublication;
  presentation: { key: string; kind: "template" | "custom"; name: string };
  publishedAt: string | null;
  dataUpdatedAt: string | null;
  publicUrl: string | null;
};

type SelectionFields = { project: MediaId | null; title: string; description: string };

/**
 * What choosing a Data Project writes into the block: always the project, and
 * the article-facing heading and description only while they are still the
 * previous project's own title and deck (or empty). Copy a reporter wrote for
 * this story is never overwritten.
 */
export function dataProjectSelection(current: SelectionFields, previous: { title: string; deck: string } | null, next: { id: MediaId; title: string; deck: string }): SelectionFields {
  const fresh = current.project === null;
  const untouched = (value: string, original: string | undefined) => value.trim() === "" || (original !== undefined && value === original);
  return {
    project: next.id,
    title: fresh || untouched(current.title, previous?.title) ? next.title : current.title,
    description: fresh || untouched(current.description, previous?.deck) ? next.deck : current.description
  };
}

const GROUPS: ReadonlyArray<{ publication: DataProjectPublication; heading: string }> = [
  { publication: "published", heading: "Published" },
  { publication: "changed", heading: "Unpublished changes" },
  { publication: "draft", heading: "Drafts" }
];

/** What a story can publish today comes first, whatever order the host returned. Empty groups are left out. */
export function groupDataProjects(items: readonly DataProjectChoice[]): Array<{ publication: DataProjectPublication; heading: string; items: DataProjectChoice[] }> {
  return GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.publication === group.publication) })).filter((group) => group.items.length);
}

/** Whether a story can publish with this project: it needs a published version (an unpublished edit does not matter). */
export const dataProjectPublishable = (publication: DataProjectPublication): boolean => publication !== "draft";
