import { describe, expect, it } from 'vitest';
import { REPORTING_NOTE_MAX_LENGTH, REPORTING_NOTE_META, readReportingNote, reportingNoteMetaPatch } from '../src/editorial/reporting-note-model';

describe('How we reported this editor model', () => {
  it('reads the stored note, or nothing', () => {
    expect(readReportingNote({ [REPORTING_NOTE_META]: 'We interviewed 14 students.' })).toBe('We interviewed 14 students.');
    expect(readReportingNote({ [REPORTING_NOTE_META]: 42 })).toBe('');
    expect(readReportingNote(undefined)).toBe('');
  });

  it('writes only its own key, within the limit the server keeps', () => {
    expect(reportingNoteMetaPatch('Notes')).toEqual({ byline_reporting_note: 'Notes' });
    expect(reportingNoteMetaPatch('a'.repeat(REPORTING_NOTE_MAX_LENGTH + 50)).byline_reporting_note).toHaveLength(REPORTING_NOTE_MAX_LENGTH);
  });
});
