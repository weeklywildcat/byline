import type { MediaAssignmentType } from "./workspace-types";

/** A file chosen for a production assignment. */
export type PickedAttachment = { id: number; title: string; previewUrl: string | null; mimeType: string | null };

/**
 * How a host lets someone choose existing media for an assignment: the
 * WordPress Media Library modal in the plugin, Byline's media picker in the
 * newsroom. Absent, the screens offer no "choose" button.
 */
export type MediaPicker = {
  available: () => boolean;
  /** Resolves with the chosen files, or an empty list when dismissed. */
  pick: (type: MediaAssignmentType, options?: { title?: string; buttonLabel?: string; multiple?: boolean }) => Promise<PickedAttachment[]>;
  /** Button label, e.g. "Add from Media Library". */
  label: string;
  /** Shown instead of the button when the picker is unavailable. */
  unavailableHint?: string;
};
