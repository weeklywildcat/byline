// The homepage's editorial slots: the stable positions an editor may pin a
// Story into (docs/front-page.md). Code owns the design; this registry only
// names the positions the design already has, so the Front Page Desk and the
// resolver agree on what "lead.lead" or "brief.rail.0" means.
//
// Identity is `<package key>.<position>`, where the package key is the
// design's package id without its `home-` prefix. Slot ids therefore survive
// ordinary content changes; they change only when code changes the design,
// and then a stored placement for a removed slot is reported, never applied.
import { BRIEF_PACKAGE_TYPE, parseBriefPackageProps } from "./brief-package";
import { IN_FOCUS_PACKAGE_TYPE } from "./in-focus-package";
import { LEAD_PACKAGE_TYPE, parseLeadPackageProps } from "./lead-package";
import { MORE_PACKAGE_TYPE, parseMorePackageProps } from "./more-package";
import { OPINION_PACKAGE_TYPE, parseOpinionPackageProps } from "./opinion-package";
import type { BylineDesignDocumentV2, BylinePackageType } from "./schema-v2";
import { parseSpecialCoveragePackageProps, SPECIAL_COVERAGE_PACKAGE_TYPE } from "./special-coverage-package";
import { parseSportsPackageProps, SPORTS_PACKAGE_TYPE } from "./sports-package";

export type HomepageSlot = {
  /** Stable id, e.g. `lead.lead`, `lead.latest.0`, `brief.rail.1`, `in-focus.story`. */
  id: string;
  packageId: string;
  packageType: BylinePackageType;
  /** Human label for editors: "Lead", "The Latest 2", "In Focus". */
  label: string;
  /** The package's lead story (`lead`), the lead package's Latest rail (`latest`), or a position in the package's story list. */
  role: "lead" | "latest" | "list";
  /** Position: 0 is the package lead for list packages; Latest positions count from 0. */
  index: number;
  /** Offered by a Story's "Feature on homepage…" (the prominent positions). */
  featured: boolean;
};

export function slotPackageKey(packageId: string): string {
  return packageId.replace(/^home-/, "");
}

const PACKAGE_LABEL: Partial<Record<BylinePackageType, string>> = {
  [BRIEF_PACKAGE_TYPE]: "The Brief",
  [IN_FOCUS_PACKAGE_TYPE]: "In Focus",
  [SPECIAL_COVERAGE_PACKAGE_TYPE]: "Special Coverage",
  [OPINION_PACKAGE_TYPE]: "Opinion",
  [SPORTS_PACKAGE_TYPE]: "Sports",
  [MORE_PACKAGE_TYPE]: "More"
};

function list(entry: { id: string; type: BylinePackageType }, count: number, leadName: string, railName: string, featuredLead: boolean): HomepageSlot[] {
  const key = slotPackageKey(entry.id);
  const label = PACKAGE_LABEL[entry.type] ?? key;
  return Array.from({ length: count }, (_, index) => index === 0
    ? { id: `${key}.${leadName}`, packageId: entry.id, packageType: entry.type, label: `${label} lead`, role: "list" as const, index, featured: featuredLead }
    : { id: `${key}.${railName}.${index - 1}`, packageId: entry.id, packageType: entry.type, label: `${label} ${index + 1}`, role: "list" as const, index, featured: false });
}

/** Every pinnable slot of a homepage design, in layout order. */
export function homepageSlots(document: BylineDesignDocumentV2): HomepageSlot[] {
  const slots: HomepageSlot[] = [];
  for (const entry of document.packages) {
    const key = slotPackageKey(entry.id);
    switch (entry.type) {
      case LEAD_PACKAGE_TYPE: {
        const props = parseLeadPackageProps(entry.props);
        const mode = props.mode ?? "content";
        if (mode !== "content" && mode !== "single-story") break;
        slots.push({ id: `${key}.lead`, packageId: entry.id, packageType: entry.type, label: "Lead", role: "lead", index: 0, featured: true });
        for (let index = 0; index < props.latest.limit; index++) slots.push({ id: `${key}.latest.${index}`, packageId: entry.id, packageType: entry.type, label: `The Latest ${index + 1}`, role: "latest", index, featured: false });
        break;
      }
      case BRIEF_PACKAGE_TYPE:
        slots.push(...list(entry, parseBriefPackageProps(entry.props).limit, "lead", "rail", true));
        break;
      case IN_FOCUS_PACKAGE_TYPE:
        slots.push({ id: `${key}.story`, packageId: entry.id, packageType: entry.type, label: "In Focus", role: "list", index: 0, featured: true });
        break;
      case SPECIAL_COVERAGE_PACKAGE_TYPE: {
        const count = parseSpecialCoveragePackageProps(entry.props).limit;
        for (let index = 0; index < count; index++) slots.push({ id: `${key}.${index}`, packageId: entry.id, packageType: entry.type, label: `Special Coverage ${index + 1}`, role: "list", index, featured: index === 0 });
        break;
      }
      case OPINION_PACKAGE_TYPE:
        slots.push(...list(entry, parseOpinionPackageProps(entry.props).limit, "lead", "rail", true));
        break;
      case SPORTS_PACKAGE_TYPE: {
        const props = parseSportsPackageProps(entry.props);
        if (props.content === "schedule") break;
        slots.push(...list(entry, props.stories.limit, "lead", "rail", true));
        break;
      }
      case MORE_PACKAGE_TYPE:
        slots.push(...list(entry, parseMorePackageProps(entry.props).limit, "lead", "rail", false));
        break;
      default:
        break;
    }
  }
  return slots;
}

/** Placements an editor stored, as a slot-id → Story-id record (never a layout). */
export type HomepagePlacements = Readonly<Record<string, number>>;

export type PlacementIssue = { slotId: string; storyId: number; reason: "unknown-slot" | "story-unavailable" | "duplicate-story" };

/**
 * Splits stored placements into the ones that can apply and the ones that
 * cannot (a slot code removed, a Story that is no longer published, the same
 * Story twice). Callers decide what an issue means: activation refuses it,
 * the public renderer skips it and falls back to automatic.
 */
export function validatePlacements(slots: readonly HomepageSlot[], placements: HomepagePlacements | undefined, available: (storyId: number) => boolean): { valid: Map<string, number>; issues: PlacementIssue[] } {
  const known = new Set(slots.map((slot) => slot.id));
  const valid = new Map<string, number>();
  const issues: PlacementIssue[] = [];
  const used = new Set<number>();
  // Layout order, so the first (most prominent) placement of a Story wins.
  const order = new Map(slots.map((slot, index) => [slot.id, index]));
  const entries = Object.entries(placements ?? {}).sort(([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity));
  for (const [slotId, storyId] of entries) {
    if (!Number.isInteger(storyId) || storyId <= 0) continue;
    if (!known.has(slotId)) issues.push({ slotId, storyId, reason: "unknown-slot" });
    else if (!available(storyId)) issues.push({ slotId, storyId, reason: "story-unavailable" });
    else if (used.has(storyId)) issues.push({ slotId, storyId, reason: "duplicate-story" });
    else {
      valid.set(slotId, storyId);
      used.add(storyId);
    }
  }
  return { valid, issues };
}
