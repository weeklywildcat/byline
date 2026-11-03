/**
 * The "How we reported this" note, as the editor stores it in post meta (see
 * includes/content/reporting-note.php). Plain text; blank lines separate
 * paragraphs. The server trims anything past the limit.
 */
export const REPORTING_NOTE_META = 'byline_reporting_note';
export const REPORTING_NOTE_MAX_LENGTH = 1500;

export function readReportingNote(meta: unknown): string {
  const record = meta && typeof meta === 'object' ? (meta as Record<string, unknown>) : {};
  const value = record[REPORTING_NOTE_META];
  return typeof value === 'string' ? value : '';
}

export function reportingNoteMetaPatch(note: string): Record<string, string> {
  return { [REPORTING_NOTE_META]: note.slice(0, REPORTING_NOTE_MAX_LENGTH) };
}
