"use client";

import { useConfig } from "@payloadcms/ui";

/**
 * The newsroom timezone (`admin.custom.newsroomTimeZone`, from
 * BYLINE_NEWSROOM_TIMEZONE on the server): every newsroom date is this
 * timezone's, never the browser's.
 */
export function useNewsroomTimeZone(): string {
  const { config } = useConfig();
  return ((config.admin?.custom ?? {}) as { newsroomTimeZone?: string }).newsroomTimeZone ?? "America/New_York";
}
