"use client";

import type { ArticleBlockIcon } from "@byline/article-body";
import { BLOCK_ICON_PATHS } from "../icons";

/** The block's drawing (the same one Payload's slash menu shows). */
export function BlockIcon({ icon, className }: { icon: ArticleBlockIcon; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {BLOCK_ICON_PATHS[icon].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}
