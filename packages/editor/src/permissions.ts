import { isPrivilegedBlockType, isArticleBlockType, type ArticleBlockType } from "@byline/article-body";
import { articleBlockFromFields } from "./fields";

/**
 * Who may write the privileged blocks (Editor's Note, Repository Interactive).
 *
 * Hiding the inserter item is not security: a staff member who can edit a
 * Story can submit any Lexical body, and an existing privileged block lives in
 * that body. The server therefore compares the submitted body with the
 * previous permitted body and applies one rule: **restore**. For a writer who
 * is not an editor, a privileged block that is new, changed or removed is put
 * back as it was (or left out when it is new), at its previous position, and
 * everything else in the submission is kept. An unchanged privileged block
 * always survives an unrelated edit, and nothing here ever discards the
 * writer's ordinary article work.
 */
type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

function rootOf(state: unknown): { root: Json; children: unknown[] } | null {
  if (!isRecord(state) || !isRecord(state.root) || !Array.isArray(state.root.children)) return null;
  return { root: state.root, children: state.root.children };
}

const privilegedType = (node: unknown): ArticleBlockType | null => {
  if (!isRecord(node) || node.type !== "block" || !isRecord(node.fields)) return null;
  const type = node.fields.blockType;
  return isArticleBlockType(type) && isPrivilegedBlockType(type) ? type : null;
};

/** The block's meaning, ignoring everything Payload adds (`blockName`, populated documents, row order metadata). */
function signature(node: Json): string {
  const fields = node.fields as Json;
  const type = fields.blockType as ArticleBlockType;
  const id = typeof fields.id === "string" ? fields.id : "";
  return JSON.stringify(articleBlockFromFields(type, id, fields));
}

const blockId = (node: Json): string => ((node.fields as Json).id as string) ?? "";

export type PrivilegedEnforcement = {
  body: unknown;
  /** Privileged blocks put back as they were (changed or removed). */
  restored: string[];
  /** Privileged blocks left out of the submission (new). */
  rejected: string[];
};

/** Whether this body holds a privileged block at all (a cheap check before any comparison). */
export function hasPrivilegedBlocks(state: unknown): boolean {
  return (rootOf(state)?.children ?? []).some((node) => privilegedType(node) !== null);
}

export function enforcePrivilegedBlocks(next: unknown, previous: unknown): PrivilegedEnforcement {
  const submitted = rootOf(next);
  if (!submitted) return { body: next, restored: [], rejected: [] };
  const before = rootOf(previous)?.children ?? [];
  const permitted = new Map<string, { node: Json; index: number }>();
  before.forEach((node, index) => {
    if (privilegedType(node) !== null) permitted.set(blockId(node as Json), { node: node as Json, index });
  });

  const restored: string[] = [];
  const rejected: string[] = [];
  const present = new Set<string>();
  const children: unknown[] = [];
  for (const node of submitted.children) {
    if (privilegedType(node) === null) {
      children.push(node);
      continue;
    }
    const id = blockId(node as Json);
    const original = permitted.get(id);
    if (!original) {
      rejected.push(id);
      continue;
    }
    present.add(id);
    if (signature(original.node) === signature(node as Json)) children.push(node);
    else {
      restored.push(id);
      children.push(original.node);
    }
  }
  // A removed privileged block comes back where it was (clamped to the document's length).
  for (const [id, { node, index }] of [...permitted.entries()].sort((a, b) => a[1].index - b[1].index)) {
    if (present.has(id)) continue;
    children.splice(Math.min(index, children.length), 0, node);
    restored.push(id);
  }
  if (!restored.length && !rejected.length) return { body: next, restored, rejected };
  return { body: { ...(next as Json), root: { ...submitted.root, children } }, restored, rejected };
}
