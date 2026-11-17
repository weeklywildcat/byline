import type { Id } from "./types";

export const leadImageCaptionShouldReset = (currentId: Id | null, nextId: Id | null) => currentId !== nextId;
