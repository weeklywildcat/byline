export type LiveCoverageUpdate = {
  id: number;
  title: string;
  html: string;
  date: string;
  modified: string;
  pinned: boolean;
  author: string;
  /** The author's public profile (`/author/<slug>/`), role and headshot. */
  authorSlug?: string;
  authorRole?: string;
  authorPhoto?: { url: string; width: number | null; height: number | null };
  image: { url: string; alt: string; width: number | null; height: number | null; credit?: string } | null;
};

export type LiveCoverage = {
  status: "live" | "ended";
  startedAt: string;
  endedAt: string;
  /** Newest first. */
  updates: LiveCoverageUpdate[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const positiveInteger = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
const textValue = (value: unknown) => typeof value === "string" ? value : "";
function publicUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("\\")) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
function instant(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})$/i);
  if (!match) return "";
  const [, year, month, day, hour, minute, second] = match;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() !== Number(month) - 1 || calendar.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

/** Validates the published WordPress live projection for build and runtime consumers. */
export function normalizeLiveCoverage(input: unknown): LiveCoverage | null {
  const value = isRecord(input) ? input : null;
  if (!value || !Array.isArray(value.updates) || (value.status !== "live" && value.status !== "ended")) return null;
  const seen = new Set<number>();
  const updates = value.updates.flatMap((entry: unknown): LiveCoverageUpdate[] => {
    if (!isRecord(entry)) return [];
    const id = positiveInteger(entry.id);
    const date = instant(entry.date);
    if (!id || !date || seen.has(id)) return [];
    seen.add(id);
    const image = isRecord(entry.image) && publicUrl(entry.image.url) ? {
      url: publicUrl(entry.image.url),
      alt: textValue(entry.image.alt),
      width: positiveInteger(entry.image.width) ?? null,
      height: positiveInteger(entry.image.height) ?? null,
      ...(textValue(entry.image.credit) ? { credit: textValue(entry.image.credit) } : {})
    } : null;
    const authorSlug = textValue(entry.authorSlug);
    const authorRole = textValue(entry.authorRole).trim();
    const authorPhoto = isRecord(entry.authorPhoto) && publicUrl(entry.authorPhoto.url) ? {
      url: publicUrl(entry.authorPhoto.url),
      width: positiveInteger(entry.authorPhoto.width) ?? null,
      height: positiveInteger(entry.authorPhoto.height) ?? null
    } : null;
    return [{
      id,
      title: textValue(entry.title),
      html: typeof entry.html === "string" ? entry.html : "",
      date,
      modified: instant(entry.modified) || date,
      pinned: entry.pinned === true,
      author: textValue(entry.author),
      ...(/^[a-z0-9%][a-z0-9%_-]*$/i.test(authorSlug) ? { authorSlug } : {}),
      ...(authorRole ? { authorRole } : {}),
      ...(authorPhoto ? { authorPhoto } : {}),
      image
    }];
  }).sort((left, right) => right.date.localeCompare(left.date) || right.id - left.id);
  return {
    status: value.status,
    startedAt: instant(value.startedAt),
    endedAt: value.status === "ended" ? instant(value.endedAt) : "",
    updates
  };
}
