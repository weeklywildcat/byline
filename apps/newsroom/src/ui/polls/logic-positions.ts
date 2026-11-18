export type Point = { x: number; y: number };
export type Positions = Readonly<Record<string, Point>>;

/** Preferences are user-owned presentation data. Ignore old node IDs and malformed coordinates. */
export function normalizePositions(value: unknown, validIds: ReadonlySet<string>): Positions {
  const result: Record<string, Point> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const id of validIds) {
    const point = (value as Record<string, unknown>)[id];
    if (!point || typeof point !== "object") continue;
    const { x, y } = point as Partial<Point>;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(x) > 200_000 || Math.abs(y) > 200_000) continue;
    result[id] = { x: Math.round(x), y: Math.round(y) };
  }
  return result;
}
