import { Button, Notice, SelectControl, Spinner, TextareaControl, TextControl } from "@wordpress/components";
import { useMemo, useState } from "@wordpress/element";
import type { CorrectionInput, CorrectionRecord, CorrectionType } from "./editorial-model";
import {
  correctionTypeLabel,
  describeEditorialError,
  formatExactEditorialDate,
  normalizeCorrectionRecords
} from "./editorial-model";
import "./editorial.css";

export type CorrectionsPanelProps = {
  records: CorrectionRecord[];
  legacyText?: string | null;
  canEdit: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  error?: unknown;
  onCreate: (input: CorrectionInput) => Promise<void> | void;
  onUpdate: (id: number | string, input: CorrectionInput) => Promise<void> | void;
  onDelete: (id: number | string) => Promise<void> | void;
};

const correctionOptions: Array<{ label: string; value: CorrectionType }> = [
  { label: "Correction", value: "correction" },
  { label: "Clarification", value: "clarification" },
  { label: "Editor's note", value: "editors-note" },
  { label: "Substantive update", value: "substantive-update" }
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Structured public notices with a read-only legacy Correction Notice fallback. */
export function CorrectionsPanel({
  records,
  legacyText,
  canEdit,
  isLoading = false,
  isSaving = false,
  error,
  onCreate,
  onUpdate,
  onDelete
}: CorrectionsPanelProps) {
  const [type, setType] = useState<CorrectionType>("correction");
  const [date, setDate] = useState(today);
  const [publicText, setPublicText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<CorrectionInput | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const displayRecords = useMemo(() => normalizeCorrectionRecords(records, legacyText), [records, legacyText]);

  const run = (operation: () => Promise<void> | void) => {
    setActionError(null);
    void Promise.resolve()
      .then(operation)
      .catch((caught: unknown) => setActionError(describeEditorialError(caught)));
  };

  const add = () => {
    if (!publicText.trim()) {
      setActionError("Add the public notice text before saving.");
      return;
    }
    run(async () => {
      await onCreate({ type, date: date || null, publicText: publicText.trim() });
      setPublicText("");
      setDate(today());
      setType("correction");
    });
  };

  const startEdit = (record: CorrectionRecord) => {
    if (record.legacy) return;
    setEditingId(String(record.id));
    setEditing({ type: record.type, date: record.date ?? "", publicText: record.publicText });
  };

  const saveEdit = (record: CorrectionRecord) => {
    if (!editing || !editing.publicText.trim()) {
      setActionError("Add the public notice text before saving.");
      return;
    }
    run(async () => {
      await onUpdate(record.id, { ...editing, publicText: editing.publicText.trim() });
      setEditingId(null);
      setEditing(null);
    });
  };

  const remove = (record: CorrectionRecord) => {
    if (record.legacy) return;
    const confirmed = typeof window === "undefined" || window.confirm("Remove this public correction or update?");
    if (confirmed) run(() => onDelete(record.id));
  };

  return (
    <section className="byline-editorial-panel byline-editorial-corrections-panel" aria-labelledby="byline-editorial-corrections-heading">
      <div className="byline-editorial-panel-heading">
        <div>
          <span className="byline-editorial-eyebrow">Public transparency</span>
          <h2 id="byline-editorial-corrections-heading">Corrections and updates</h2>
        </div>
        {isLoading || isSaving ? <Spinner /> : null}
      </div>

      {error ? <Notice status="warning" isDismissible={false}>{describeEditorialError(error)}</Notice> : null}
      {actionError ? <Notice status="error" isDismissible={false}>{actionError}</Notice> : null}

      {legacyText?.trim() && records.length === 0 ? (
        <Notice status="info" isDismissible={false}>
          This story has a legacy Correction Notice. It remains supported and is shown once; new records below use the structured format.
        </Notice>
      ) : null}

      {canEdit ? (
        <div className="byline-editorial-correction-form">
          <SelectControl label="Notice type" value={type} options={correctionOptions} disabled={isSaving} onChange={(value) => setType(value as CorrectionType)} />
          <TextControl label="Notice date" type="date" value={date} disabled={isSaving} onChange={setDate} />
          <TextareaControl label="Public notice" value={publicText} disabled={isSaving} onChange={setPublicText} help="Write what readers need to know. Do not include internal notes." />
          <Button variant="primary" disabled={isSaving || !publicText.trim()} onClick={add}>Add notice</Button>
        </div>
      ) : null}

      {displayRecords.length === 0 ? (
        <p className="byline-editorial-empty-state">No corrections or updates have been recorded.</p>
      ) : (
        <ol className="byline-editorial-correction-list" aria-label="Correction and update history">
          {displayRecords.map((record) => {
            const isEditing = editingId === String(record.id) && editing;
            return (
              <li key={String(record.id)} className="byline-editorial-correction-item">
                {isEditing ? (
                  <div className="byline-editorial-correction-form">
                    <SelectControl label="Notice type" value={editing.type} options={correctionOptions} disabled={isSaving} onChange={(value) => setEditing({ ...editing, type: value as CorrectionType })} />
                    <TextControl label="Notice date" type="date" value={editing.date?.slice(0, 10) ?? ""} disabled={isSaving} onChange={(value) => setEditing({ ...editing, date: value || null })} />
                    <TextareaControl label="Public notice" value={editing.publicText} disabled={isSaving} onChange={(value) => setEditing({ ...editing, publicText: value })} />
                    <div className="byline-editorial-inline-actions">
                      <Button variant="primary" disabled={isSaving} onClick={() => saveEdit(record)}>Save changes</Button>
                      <Button variant="tertiary" disabled={isSaving} onClick={() => { setEditingId(null); setEditing(null); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="byline-editorial-correction-heading">
                      <strong>{correctionTypeLabel(record.type)}</strong>
                      {record.date ? <time dateTime={record.date}>{formatExactEditorialDate(record.date)}</time> : <span>No date</span>}
                      {record.legacy ? <span className="byline-editorial-badge">Legacy notice</span> : null}
                    </div>
                    <p>{record.publicText}</p>
                    {canEdit && !record.legacy ? (
                      <div className="byline-editorial-inline-actions">
                        <Button variant="tertiary" disabled={isSaving} onClick={() => startEdit(record)}>Edit</Button>
                        <Button variant="tertiary" isDestructive disabled={isSaving} onClick={() => remove(record)}>Remove</Button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
