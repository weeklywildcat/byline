"use client";

import { ARTICLE_BLOCK_LIMITS as LIMITS, formatTimestamp, parseTimestamp } from "@byline/article-body";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ChapterFields } from "../../fields";
import { newRowId } from "../../fields";
import { ToolButton } from "../chrome";
import { InlineText } from "../fields";
import { focusIn } from "./shared";

function parseChapterTime(text: string): number | null {
  const time = parseTimestamp(text);
  return time !== null && time <= LIMITS.chapterTimeMax ? time : null;
}

/** A chapter's time, typed as a reader reads it ("1:24"); kept as typed until it reads as a time. */
function ChapterTime({ value, index, readOnly, onChange, onEnter }: { value: number | null; index: number; readOnly: boolean; onChange: (time: number | null) => void; onEnter: () => void }) {
  const [text, setText] = useState(value === null ? "" : formatTimestamp(value));
  useEffect(() => {
    // Follow outside changes (undo, sorting) unless the typed text already means this time.
    if (parseChapterTime(text) !== value) setText(value === null ? "" : formatTimestamp(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only an outside change of `value` resets the text
  }, [value]);
  const parsed = parseChapterTime(text);
  const invalid = text.trim() !== "" && parsed === null;
  return (
    <input
      type="text"
      inputMode="numeric"
      data-byline-field=""
      className="byline-field byline-chapter-time"
      aria-label={`Time of chapter ${index + 1}, minutes and seconds`}
      aria-invalid={invalid || undefined}
      placeholder="0:00"
      value={text}
      readOnly={readOnly}
      maxLength={8}
      onChange={(event) => {
        setText(event.target.value);
        const time = parseChapterTime(event.target.value);
        if (time !== value) onChange(time);
      }}
      onBlur={() => {
        if (parsed !== null) setText(formatTimestamp(parsed));
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
 * Timestamped chapters, edited in the list readers will see: a time and a
 * short label per row. Rows are added from the block toolbar (Add chapter).
 */
export function ChaptersEditor({ chapters, readOnly, root, onChange, announce }: { chapters: ChapterFields[]; readOnly: boolean; root: () => HTMLElement | null; onChange: (chapters: ChapterFields[]) => void; announce: (message: string) => void }) {
  if (!chapters.length) return null;
  const update = (index: number, patch: Partial<ChapterFields>) => onChange(chapters.map((chapter, i) => (i === index ? { ...chapter, ...patch } : chapter)));
  return (
    <div className="byline-media-chapters" role="group" aria-label="Chapters">
      <p className="byline-kicker">Chapters</p>
      <ol>
        {chapters.map((chapter, index) => (
          <li key={chapter.id} data-chapter-index={index} className="byline-editable-row byline-chapter-row">
            <ChapterTime value={chapter.time} index={index} readOnly={readOnly} onChange={(time) => update(index, { time })} onEnter={() => focusIn(root(), `[data-chapter-index="${index}"] .byline-chapter-label`, true)} />
            <InlineText className="byline-chapter-label" label={`Label of chapter ${index + 1}`} placeholder="What happens here" value={chapter.label} maxLength={LIMITS.chapterLabel} readOnly={readOnly} onEnter={() => {
              if (index < chapters.length - 1) focusIn(root(), `[data-chapter-index="${index + 1}"] .byline-chapter-time`, true);
            }} onChange={(label) => update(index, { label })} />
            {readOnly ? null : (
              <ButtonGroup className="byline-row-actions" data-byline-chrome="">
                <ToolButton label={`Remove chapter ${index + 1}`} onClick={() => {
                  const next = chapters.filter((_, i) => i !== index);
                  onChange(next);
                  announce(`Chapter removed. ${next.length} left.`);
                  if (next.length) focusIn(root(), `[data-chapter-index="${Math.min(index, next.length - 1)}"] .byline-chapter-time`);
                }}><Trash2 /></ToolButton>
              </ButtonGroup>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A new chapter after the last, starting where the last one did. */
export function addChapter(chapters: ChapterFields[]): ChapterFields[] | null {
  if (chapters.length >= LIMITS.chaptersMax) return null;
  return [...chapters, { id: newRowId(), time: null, label: "" }];
}
