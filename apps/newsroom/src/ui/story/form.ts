"use client";

import { useField } from "@payloadcms/ui";
import type { ClientField } from "payload";
import type { Id } from "./types";

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
