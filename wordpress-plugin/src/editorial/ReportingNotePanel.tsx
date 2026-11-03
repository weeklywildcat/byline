import { TextareaControl } from '@wordpress/components';
import { __, sprintf } from '@wordpress/i18n';
import { REPORTING_NOTE_MAX_LENGTH } from './reporting-note-model';

export type ReportingNotePanelProps = {
  note: string;
  onChange: (note: string) => void;
};

/**
 * A short note readers see after the story. Leave it empty and nothing prints.
 */
export function ReportingNotePanel({ note, onChange }: ReportingNotePanelProps) {
  const remaining = REPORTING_NOTE_MAX_LENGTH - note.length;

  return (
    <div className="byline-reporting-note">
      <TextareaControl
        __nextHasNoMarginBottom
        label={__('How we reported this', 'weekly-wildcat-headless')}
        hideLabelFromVision
        value={note}
        rows={6}
        maxLength={REPORTING_NOTE_MAX_LENGTH}
        placeholder={__('Example: Reporters interviewed 14 students and three administrators over two weeks and reviewed the district’s lunch budget.', 'weekly-wildcat-headless')}
        help={remaining < 200
          /* translators: %d: number of characters left. */
          ? sprintf(__('%d characters left.', 'weekly-wildcat-headless'), Math.max(0, remaining))
          : __('Who you talked to, what you read, and why you wrote it. Readers see this after the story. Leave a blank line between paragraphs.', 'weekly-wildcat-headless')}
        onChange={onChange}
      />
    </div>
  );
}
