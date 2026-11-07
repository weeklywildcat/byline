"use client";

import { useDocumentInfo, useField, useForm, useFormBackgroundProcessing, useFormModified } from "@payloadcms/ui";
import type { ClientField } from "payload";
import { useEffect, useRef } from "react";
import { autosaveLeftNothingUnsaved, type AutosaveWindow } from "./autosave-settle";
import type { Id } from "./types";

/**
 * Clears the form's `modified` flag when an autosave succeeded and the form's
 * data is what the autosave started with. Payload leaves the flag set if
 * anything called `setModified` while the save was running, even without a
 * change, which pinned "Unsaved changes" (and the leave guard) on a saved
 * story. A real edit made during the save still differs from the snapshot, so
 * it stays unsaved and autosaves next. See `autosave-settle.ts`.
 */
export function useSettleAutosave() {
  const { getData, setModified } = useForm();
  const modified = useFormModified();
  const background = useFormBackgroundProcessing();
  const { lastUpdateTime } = useDocumentInfo();
  const started = useRef<AutosaveWindow | null>(null);
  const latest = useRef({ modified, lastUpdateTime });
  latest.current = { modified, lastUpdateTime };

  useEffect(() => {
    if (background) {
      started.current = { values: getData(), savedAt: latest.current.lastUpdateTime };
      return;
    }
    const start = started.current;
    started.current = null;
    if (!start) return;
    const end: AutosaveWindow = { values: getData(), savedAt: latest.current.lastUpdateTime };
    if (autosaveLeftNothingUnsaved(start, end, latest.current.modified)) setModified(false);
  }, [background, getData, setModified]);
}

/** A story field from Payload's form state. Writes go to the same form autosave and publish read. */
export function useStoryField<T>(path: string) {
  const { value, setValue, showError, errorMessage } = useField<T>({ path });
  return { value, setValue: (next: T) => setValue(next), error: showError ? errorMessage : undefined };
}

export function relationIdsOf(value: unknown): Id[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => (entry && typeof entry === "object" && "id" in entry ? (entry as { id: Id }).id : entry)).filter((id): id is Id => typeof id === "number" || typeof id === "string");
}

export function relationIdOf(value: unknown): Id | null {
  if (typeof value === "number" || (typeof value === "string" && value !== "")) return value;
  if (value && typeof value === "object" && "id" in value) return (value as { id: Id }).id;
  return null;
}

/** A named child field's client config, for the few inputs Payload must render itself (the editor engine, uploads). */
export function childField(fields: ClientField[], name: string): ClientField | undefined {
  return fields.find((field) => "name" in field && field.name === name);
}
