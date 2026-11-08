"use client";

import { createHistoryGuard } from "../shell/history-guard";

/** Media's browser history and its Back/Forward guard for unsaved file details (shell/history-guard.ts). */
const media = createHistoryGuard("bylineMedia");

export const pushMediaEntry = media.push;
export const replaceMediaEntry = media.replace;
export const useMediaHistoryGuard = media.useGuard;
