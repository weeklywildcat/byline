"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, calendarDate, type FinalScoreStatus } from "@byline/article-body";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { FinalScoreView, finalScoreDetails } from "@byline/ui/article-body";
import { ArrowDownUp, CalendarDays } from "lucide-react";
import { useId, useRef } from "react";
import { BlockShell, SecondarySetting, ToolTextButton } from "../chrome";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce } from "../host";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

const STATUSES: ReadonlyArray<{ value: FinalScoreStatus; label: string }> = [
  { value: "final", label: "Final" },
  { value: "overtime", label: "Final in overtime" },
  { value: "tie", label: "Tie" },
  { value: "forfeit", label: "Forfeit" }
];

/** A score typed where the public score prints: digits only, blank allowed while drafting. */
function ScoreInput({ value, label, readOnly, onChange, onEnter }: { value: number | null; label: string; readOnly: boolean; onChange: (value: number | null) => void; onEnter: () => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      data-byline-field=""
      className="byline-field byline-final-score-input"
      aria-label={label}
      placeholder="–"
      maxLength={3}
      value={value ?? ""}
      readOnly={readOnly}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, 3);
        onChange(digits === "" ? null : Math.min(LIMITS.finalScoreMax, Number(digits)));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      }}
    />
  );
}

/**
 * Final Score: two team rows, typed in place, scores where the public scores
 * print. Swap teams, the result and optional game details (sport, date,
 * location, note) live in the toolbar. Nothing here touches a sports record.
 */
export function FinalScoreEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("finalScore", node);
  const issues = useReadiness("finalScore", id, node.fields);
  const announce = useAnnounce();
  const teamA = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, teamA);
  const readOnly = !node.editable;
  const root = () => node.editor.getElementByKey(nodeKey);
  const ids = { sport: useId(), date: useId(), location: useId(), note: useId() };
  const dateInvalid = fields.date !== "" && !calendarDate(fields.date);
  const swap = () => {
    set({ teamA: fields.teamB, teamAScore: fields.teamBScore, teamB: fields.teamA, teamBScore: fields.teamAScore });
    announce(`Teams swapped. ${fields.teamB || "Team B"} is listed first.`);
  };
  const block = { status: fields.status, sport: fields.sport || undefined, teamA: fields.teamA || "Team A", teamB: fields.teamB || "Team B", teamAScore: fields.teamAScore, teamBScore: fields.teamBScore };
  const details = finalScoreDetails({ date: calendarDate(fields.date) ?? undefined, location: fields.location || undefined });

  return (
    <BlockShell
      type="finalScore"
      node={node}
      issues={issues}
      actions={
        <>
          <ButtonGroup>
            <ToolTextButton label="Swap teams" icon={<ArrowDownUp />} onClick={swap} />
          </ButtonGroup>
          <Select value={fields.status} disabled={readOnly} onValueChange={(value) => {
            const status = value as FinalScoreStatus;
            set({ status });
            announce(`Result: ${STATUSES.find((entry) => entry.value === status)?.label}.`);
          }}>
            <SelectTrigger size="sm" aria-label="Result" className="min-w-36">
              <SelectValue>{(value: string) => STATUSES.find((entry) => entry.value === value)?.label ?? "Final"}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <SecondarySetting label="Game details" title="Game details" description="Optional. They print under the score." icon={<CalendarDays />}>
            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor={ids.sport}>Sport</FieldLabel>
                <Input id={ids.sport} placeholder="Football" value={fields.sport} maxLength={LIMITS.finalScoreSport} readOnly={readOnly} onChange={(event) => set({ sport: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
              </Field>
              <Field data-invalid={dateInvalid || undefined}>
                <FieldLabel htmlFor={ids.date}>Date played</FieldLabel>
                <Input id={ids.date} type="date" value={fields.date} readOnly={readOnly} aria-invalid={dateInvalid || undefined} onChange={(event) => set({ date: event.target.value })} />
                {dateInvalid ? <FieldError>Choose a real date.</FieldError> : <FieldDescription>The day of the game. Never shifted by time zone.</FieldDescription>}
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.location}>Location</FieldLabel>
                <Input id={ids.location} placeholder="Wildcat Stadium" value={fields.location} maxLength={LIMITS.finalScoreLocation} readOnly={readOnly} onChange={(event) => set({ location: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.note}>Note</FieldLabel>
                <Input id={ids.note} placeholder="Region championship" value={fields.note} maxLength={LIMITS.finalScoreNote} readOnly={readOnly} onChange={(event) => set({ note: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
              </Field>
            </FieldGroup>
          </SecondarySetting>
        </>
      }
    >
      <FinalScoreView
        block={block}
        teamA={<InlineText inputRef={teamA} className="byline-final-score-team-field" label="First team" placeholder="Team" value={fields.teamA} maxLength={LIMITS.finalScoreTeam} readOnly={readOnly} onEnter={() => focusIn(root(), ".byline-final-score-row:first-child .byline-final-score-input", true)} onChange={(value) => set({ teamA: value })} />}
        scoreA={<ScoreInput value={fields.teamAScore} label={`${fields.teamA || "First team"} score`} readOnly={readOnly} onChange={(teamAScore) => set({ teamAScore })} onEnter={() => focusIn(root(), ".byline-final-score-row:last-child .byline-field", true)} />}
        teamB={<InlineText className="byline-final-score-team-field" label="Second team" placeholder="Opponent" value={fields.teamB} maxLength={LIMITS.finalScoreTeam} readOnly={readOnly} onEnter={() => focusIn(root(), ".byline-final-score-row:last-child .byline-final-score-input", true)} onChange={(value) => set({ teamB: value })} />}
        scoreB={<ScoreInput value={fields.teamBScore} label={`${fields.teamB || "Second team"} score`} readOnly={readOnly} onChange={(teamBScore) => set({ teamBScore })} onEnter={() => undefined} />}
        details={details || undefined}
        note={fields.note || undefined}
      />
    </BlockShell>
  );
}
