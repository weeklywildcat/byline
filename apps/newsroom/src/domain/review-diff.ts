import type { ReviewBlock } from "./review-blocks";

/**
 * "What changed since I last reviewed this?" (docs/review.md#changes-since):
 * a small, deterministic comparison of two versions' reviewable blocks. Not a
 * general diff engine: blocks are matched in order, a block edited in place is
 * shown word by word, and media is compared by which files each block shows.
 * Both versions are immutable Payload versions, so the answer never moves.
 */

export type WordPart = { text: string; change: "same" | "added" | "removed" };

/** How a block of the newer version differs from the older one. Unchanged blocks are absent. */
export type BlockChange =
  | { id: string; status: "added" }
  | { id: string; status: "changed"; parts: WordPart[] };

/** A block that was in the older version and isn't in the newer one, and where it used to be. */
export type RemovedBlock = { after: string | null; kind: ReviewBlock["kind"]; text: string };

export type VisualChange = { change: "added" | "removed" | "replaced" | "details"; where: string; before: number[]; after: number[] };

export type VersionComparison = {
  blocks: BlockChange[];
  removed: RemovedBlock[];
  visuals: VisualChange[];
  /** Counts for the summary line. */
  counts: { changed: number; added: number; removed: number };
};

const textKey = (block: ReviewBlock) => `${block.kind}:${block.text}`;

/** Longest common subsequence of two key lists, as index pairs. */
function commonPairs(before: readonly string[], after: readonly string[]): Array<[number, number]> {
  const width = after.length + 1;
  const table = new Uint16Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i * width + j] = before[i] === after[j] ? table[(i + 1) * width + j + 1]! + 1 : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i += 1;
    else j += 1;
  }
  return pairs;
}

/** Words, runs of space and single punctuation marks, so "lunch." and "lunch" share the word. */
const words = (text: string) => text.match(/\s+|[\p{L}\p{N}'’-]+|[^\s]/gu) ?? [];

/** Word-by-word differences between two texts. Very long texts are shown as replaced whole. */
export function wordDiff(before: string, after: string): WordPart[] {
  const a = words(before);
  const b = words(after);
  if (a.length * b.length > 4_000_000) return [{ text: before, change: "removed" }, { text: after, change: "added" }];
  const parts: WordPart[] = [];
  const push = (text: string, change: WordPart["change"]) => {
    const last = parts.at(-1);
    if (last && last.change === change) last.text += text;
    else parts.push({ text, change });
  };
  let i = 0;
  let j = 0;
  for (const [x, y] of [...commonPairs(a, b), [a.length, b.length] as [number, number]]) {
    while (i < x) push(a[i++]!, "removed");
    while (j < y) push(b[j++]!, "added");
    if (x < a.length) { push(a[x]!, "same"); i = x + 1; j = y + 1; }
  }
  return parts;
}

/** How alike two texts are, 0 to 1, by the words they share. */
function similarity(a: string, b: string): number {
  const left = new Set(words(a).filter((word) => word.trim()));
  const right = new Set(words(b).filter((word) => word.trim()));
  if (!left.size && !right.size) return 1;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / (left.size + right.size - shared);
}

/** The text blocks (everything but media) compared, in order. */
function compareText(before: readonly ReviewBlock[], after: readonly ReviewBlock[]): Pick<VersionComparison, "blocks" | "removed"> {
  const pairs = commonPairs(before.map(textKey), after.map(textKey));
  const blocks: BlockChange[] = [];
  const removed: RemovedBlock[] = [];
  let i = 0;
  let j = 0;
  const gap = (x: number, y: number) => {
    const gone = before.slice(i, x).map((block, offset) => ({ block, index: i + offset }));
    const fresh = after.slice(j, y).map((block, offset) => ({ block, index: j + offset }));
    const taken = new Set<number>();
    for (const entry of fresh) {
      // An edited block keeps its kind and most of its words; otherwise it is a new one.
      const match = gone.filter((candidate) => !taken.has(candidate.index) && candidate.block.kind === entry.block.kind).map((candidate) => ({ candidate, score: similarity(candidate.block.text, entry.block.text) })).sort((l, r) => r.score - l.score)[0];
      if (match && match.score >= 0.4) {
        taken.add(match.candidate.index);
        blocks.push({ id: entry.block.id, status: "changed", parts: wordDiff(match.candidate.block.text, entry.block.text) });
      } else blocks.push({ id: entry.block.id, status: "added" });
    }
    for (const entry of gone) {
      if (taken.has(entry.index)) continue;
      // Where it was: after the nearest block that is still there before it.
      const previous = pairs.filter(([from]) => from < entry.index).at(-1);
      removed.push({ after: previous ? after[previous[1]]!.id : null, kind: entry.block.kind, text: entry.block.text });
    }
  };
  for (const [x, y] of pairs) {
    gap(x, y);
    i = x + 1;
    j = y + 1;
  }
  gap(before.length, after.length);
  return { blocks, removed };
}

const mediaSequence = (blocks: readonly ReviewBlock[]) => blocks.filter((block) => block.media).map((block) => ({ where: block.media!.label, ids: block.media!.uses.map((use) => use.mediaId), alts: block.media!.uses.map((use) => use.alt) }));

/** Which Media each block shows, compared: added, removed, replaced in the same place, or only its alt text changed. */
function compareMedia(before: readonly ReviewBlock[], after: readonly ReviewBlock[]): VisualChange[] {
  const a = mediaSequence(before);
  const b = mediaSequence(after);
  const key = (entry: { where: string; ids: number[] }) => `${entry.where}:${entry.ids.join(",")}`;
  const pairs = commonPairs(a.map(key), b.map(key));
  const changes: VisualChange[] = [];
  let i = 0;
  let j = 0;
  const gap = (x: number, y: number) => {
    const gone = a.slice(i, x);
    const fresh = b.slice(j, y);
    const paired = Math.min(gone.length, fresh.length);
    for (let n = 0; n < paired; n += 1) {
      const from = gone[n]!;
      const to = fresh[n]!;
      if (from.where === to.where) changes.push({ change: "replaced", where: to.where, before: from.ids, after: to.ids });
      else {
        changes.push({ change: "removed", where: from.where, before: from.ids, after: [] });
        changes.push({ change: "added", where: to.where, before: [], after: to.ids });
      }
    }
    for (const entry of gone.slice(paired)) changes.push({ change: "removed", where: entry.where, before: entry.ids, after: [] });
    for (const entry of fresh.slice(paired)) changes.push({ change: "added", where: entry.where, before: [], after: entry.ids });
  };
  for (const [x, y] of pairs) {
    gap(x, y);
    // Same files in the same place, but the alt text a reader who can't see them gets changed.
    if (a[x]!.alts.join("\u0001") !== b[y]!.alts.join("\u0001")) changes.push({ change: "details", where: b[y]!.where, before: a[x]!.ids, after: b[y]!.ids });
    i = x + 1;
    j = y + 1;
  }
  gap(a.length, b.length);
  return changes;
}

export function compareVersions(before: readonly ReviewBlock[], after: readonly ReviewBlock[]): VersionComparison {
  const text = compareText(before.filter((block) => !block.media), after.filter((block) => !block.media));
  const mediaChanged = compareMedia(before, after);
  // A changed caption is words: it shows with the copy, on its media block.
  const captions: BlockChange[] = [];
  const beforeMedia = before.filter((block) => block.media);
  for (const block of after.filter((entry) => entry.media)) {
    const twin = beforeMedia.find((entry) => entry.media!.label === block.media!.label && entry.media!.uses.map((use) => use.mediaId).join(",") === block.media!.uses.map((use) => use.mediaId).join(","));
    if (twin && twin.text !== block.text) captions.push({ id: block.id, status: "changed", parts: wordDiff(twin.text, block.text) });
  }
  const blocks = [...text.blocks, ...captions];
  return {
    blocks,
    removed: text.removed,
    visuals: mediaChanged,
    counts: { changed: blocks.filter((change) => change.status === "changed").length, added: blocks.filter((change) => change.status === "added").length, removed: text.removed.length }
  };
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "2 paragraphs changed · 1 added · 1 removed": the copy half of the summary, empty when the words are the same. */
export function copySummary(counts: VersionComparison["counts"]): string {
  const parts: string[] = [];
  if (counts.changed) parts.push(`${plural(counts.changed, "passage")} edited`);
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  return parts.join(" · ");
}

/** The visuals half of the summary: what a person would look at again. */
export function visualSummary(changes: readonly VisualChange[]): string {
  return changes.map((change) => {
    const subject = change.where.toLowerCase();
    switch (change.change) {
      case "added": return `${change.where} added`;
      case "removed": return `${change.where} removed`;
      case "replaced": return `${change.where} replaced`;
      case "details": return `Alt text changed on a ${subject}`;
    }
  }).join(" · ");
}
