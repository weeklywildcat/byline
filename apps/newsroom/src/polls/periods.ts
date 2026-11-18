/**
 * The collection periods offered when an interviewer starts fieldwork
 * (docs/wildcat-polls.md#collect). One boundary for the newsroom's school day:
 * Poll Studio reads them from the server (`pollsOverview`), never from its own
 * strings, and the interviewer can always describe a period in their own
 * words instead.
 *
 * Still to do: make the list editable by the newsroom (a Publication Global
 * field read here) rather than a constant.
 */
export const DEFAULT_COLLECTION_PERIODS = ["Before school", "Lunch A", "Lunch B", "Lunch C", "After school"] as const;

export function collectionPeriods(): string[] {
  return [...DEFAULT_COLLECTION_PERIODS];
}
