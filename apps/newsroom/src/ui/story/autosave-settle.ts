/**
 * Payload clears the form's `modified` flag when an autosave succeeds, unless
 * anything called `setModified` while that autosave was in flight. It does not
 * check whether the form's data actually changed: a Lexical onChange that
 * re-emits the saved state, a block resolving its media, a field re-announcing
 * its value, all count. After such a call the save is correct and complete,
 * yet "Unsaved changes" stays on until some later edit triggers another save.
 *
 * This is the check Payload skips. When an autosave finishes and the form's
 * data is exactly what it was when the autosave started, nothing is unsaved.
 */

export type AutosaveWindow = {
  /** The form's values (`getData()`) at this point. */
  values: Record<string, unknown>;
  /** The document's last-saved time (`useDocumentInfo().lastUpdateTime`). */
  savedAt: number | undefined;
};

/** Payload's own autosave diff ignores `updatedAt`: it changes on every save. */
function withoutUpdatedAt(values: Record<string, unknown>): Record<string, unknown> {
  const { updatedAt: _updatedAt, ...rest } = values;
  return rest;
}

/** Deep equality for form data (JSON values), independent of object key order. */
export function sameFormValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((entry, index) => sameFormValue(entry, b[index]));
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  // An absent key and an `undefined` one are the same value in JSON.
  const present = (record: Record<string, unknown>) => Object.keys(record).filter((key) => record[key] !== undefined).length;
  return present(left) === present(right) && keys.every((key) => sameFormValue(left[key], right[key]));
}

/**
 * Whether the autosave that ran from `start` to `end` left nothing unsaved even
 * though Payload still reports the form as modified. It needs the save to have
 * succeeded (the document's saved time moved: a failed autosave leaves `modified`
 * true on purpose) and the values not to have moved (a real edit made while
 * saving must stay unsaved, for the next autosave).
 */
export function autosaveLeftNothingUnsaved(start: AutosaveWindow, end: AutosaveWindow, modified: boolean): boolean {
  if (!modified) return false;
  if (end.savedAt === undefined || end.savedAt === start.savedAt) return false;
  return sameFormValue(withoutUpdatedAt(start.values), withoutUpdatedAt(end.values));
}
