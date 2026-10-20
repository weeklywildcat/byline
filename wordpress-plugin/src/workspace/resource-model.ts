import { RESOURCE_PURPOSES, type ResourcePurpose, type StoryResource } from "./workspace-types";
import { RESOURCE_PURPOSE_LABELS } from "./reporting-model";

export const purposeLabel = (purpose: string) => (RESOURCE_PURPOSE_LABELS as Record<string, string>)[purpose] ?? "Other";
export const normalizePurpose = (value: string): ResourcePurpose => ((RESOURCE_PURPOSES as readonly string[]).includes(value) ? (value as ResourcePurpose) : "other");

/** "Google Doc · Draft". The generic "Other" purpose adds nothing, so it is left out. */
export function resourceSubtitle(resource: Pick<StoryResource, "kind" | "purpose">): string {
  return [resource.kind, resource.purpose && resource.purpose !== "other" ? purposeLabel(resource.purpose) : ""].filter(Boolean).join(" · ");
}

/** The one resource marked as the working draft. Zero or several: no single obvious draft. */
export function workingDraft(resources: StoryResource[]): StoryResource | null {
  const drafts = resources.filter((resource) => resource.purpose === "draft");
  return drafts.length === 1 ? drafts[0] : null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateLink(link: { label: string; url: string }): Partial<Record<"label" | "url", string>> {
  const errors: Partial<Record<"label" | "url", string>> = {};
  if (!link.label.trim()) errors.label = "Add a label.";
  else if (link.label.trim().length > 120) errors.label = "Keep the label under 120 characters.";
  if (!link.url.trim()) errors.url = "Add a link.";
  else if (link.url.trim().length > 2048 || !isHttpUrl(link.url)) errors.url = "Use a full link that starts with http:// or https://.";
  return errors;
}
