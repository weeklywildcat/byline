import { LEAD_PACKAGE_TYPE, parseLeadPackageProps } from "./lead-package";
import { SPORTS_PACKAGE_TYPE, parseSportsPackageProps } from "./sports-package";
import type { BylineDesignDocumentV2, BylineStorySource } from "./schema-v2";

// Stories an editor pinned by hand, gathered from the whole document.
//
// A pin is an explicit override, and the ordered selection pass has to know
// about it *before* it runs: the homepage's de-duplication set is walked once,
// in layout order, so a story pinned into a late package would otherwise already
// have been claimed by an earlier one and the pin would silently do nothing.
//
// Reserving them up front keeps exactly one used-story set. It is the only piece
// of whole-page orchestration this phase introduces, and it is here rather than
// in a package resolver because no single package can see the others' pins.

function pinnedFrom(source: BylineStorySource | { type: string }): number[] {
  return source.type === "manual" ? (source as { storyIds: number[] }).storyIds : [];
}

export function collectPinnedStoryIds(document: BylineDesignDocumentV2): Set<number> {
  const pinned = new Set<number>();

  for (const entry of document.packages) {
    if (entry.type === LEAD_PACKAGE_TYPE) {
      const props = parseLeadPackageProps(entry.props);

      for (const id of [...pinnedFrom(props.lead.source), ...pinnedFrom(props.latest.source)]) pinned.add(id);
    }

    if (entry.type === SPORTS_PACKAGE_TYPE) {
      const props = parseSportsPackageProps(entry.props);

      for (const id of [...pinnedFrom(props.stories.source), ...pinnedFrom(props.athleteSpotlight.source)]) {
        pinned.add(id);
      }
    }
  }

  return pinned;
}
