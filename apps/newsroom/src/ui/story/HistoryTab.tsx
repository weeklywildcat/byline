"use client";

import { buttonVariants } from "@byline/newsroom-ui/ui/button";
import { useDocumentInfo } from "@payloadcms/ui";
import { formatDay, SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";

/**
 * History. Payload's Versions are the one revision engine (drafts, autosaves,
 * publications, diffs and restore). This tab summarizes them; the Byline
 * History view over the same versions replaces the link in a later phase.
 */
export function HistoryTab({ context }: { context: StoryScreenContext }) {
  const { id, versionCount, unpublishedVersionCount, hasPublishedDoc, lastUpdateTime } = useDocumentInfo();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      <SectionHeading>Versions</SectionHeading>
      <p className="text-sm">
        {versionCount} saved {versionCount === 1 ? "version" : "versions"}
        {hasPublishedDoc && unpublishedVersionCount > 0 ? `, ${unpublishedVersionCount} since the last publication` : ""}.
        {lastUpdateTime ? ` Last saved ${formatDay(new Date(lastUpdateTime).toISOString(), context.timeZone)}.` : ""}
      </p>
      {id !== undefined ? (
        <a className={buttonVariants({ variant: "outline", size: "sm", className: "w-fit" })} href={`${context.admin}/collections/stories/${id}/versions`}>
          Compare and restore versions
        </a>
      ) : null}
    </div>
  );
}
