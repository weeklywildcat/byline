import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const MORE_PACKAGE_TYPE = "more-package";

export type MorePackageProps = {
  heading: string;
  source: BylineStorySource;
  limit: number;
  archiveLink: {
    enabled: boolean;
    href: string;
    label: string;
  };
  utility: {
    enabled: boolean;
    joinStaff: {
      enabled: boolean;
      heading: string;
      copy: string;
    };
    stayConnected: {
      enabled: boolean;
      heading: string;
      copy: string;
    };
  };
  presentation: {
    showDeck: boolean;
    cleanDeck: boolean;
  };
};

export const WEEKLY_WILDCAT_MORE_DEFAULTS: MorePackageProps = {
  heading: "More From {publication.shortName}",
  source: { type: "compatibility-more" },
  limit: 4,
  archiveLink: { enabled: true, href: "/stories/", label: "View All Stories →" },
  utility: {
    enabled: true,
    joinStaff: {
      enabled: true,
      heading: "Join the Staff",
      copy: "Report games, photograph campus life, design pages, or help edit the next story package."
    },
    stayConnected: {
      enabled: true,
      heading: "Stay Connected",
      copy: "Follow daily posts, send a tip, or bring {publication.shortName} into your inbox."
    }
  },
  presentation: { showDeck: true, cleanDeck: true }
};

export const NEUTRAL_MORE_DEFAULTS: MorePackageProps = {
  heading: "More Stories",
  source: { type: "latest" },
  limit: 4,
  archiveLink: { enabled: true, href: "/stories/", label: "View all stories →" },
  utility: {
    enabled: false,
    joinStaff: { enabled: false, heading: "Join the newsroom", copy: "" },
    stayConnected: { enabled: false, heading: "Stay connected", copy: "" }
  },
  presentation: { showDeck: true, cleanDeck: false }
};

const MAX_STORIES = 50;

function boundedCount(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_STORIES
    ? value
    : fallback;
}

function text(value: unknown, fallback: string, max = 240) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function link(value: unknown, fallback: { enabled: boolean; href: string; label: string }) {
  const candidate = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    enabled: boolean(candidate.enabled, fallback.enabled),
    href: text(candidate.href, fallback.href),
    label: text(candidate.label, fallback.label, 80)
  };
}

function utilityBlock(
  value: unknown,
  fallback: { enabled: boolean; heading: string; copy: string }
) {
  const candidate = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    enabled: boolean(candidate.enabled, fallback.enabled),
    heading: text(candidate.heading, fallback.heading, 80),
    copy: text(candidate.copy, fallback.copy)
  };
}

export function parseMorePackageProps(
  value: unknown,
  defaults: MorePackageProps = WEEKLY_WILDCAT_MORE_DEFAULTS
): MorePackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const utility = (props.utility ?? {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    heading: text(props.heading, defaults.heading, 120),
    source: parseStorySource(props.source) ?? defaults.source,
    limit: boundedCount(props.limit, defaults.limit),
    archiveLink: link(props.archiveLink, defaults.archiveLink),
    utility: {
      enabled: boolean(utility.enabled, defaults.utility.enabled),
      joinStaff: utilityBlock(utility.joinStaff, defaults.utility.joinStaff),
      stayConnected: utilityBlock(utility.stayConnected, defaults.utility.stayConnected)
    },
    presentation: {
      showDeck: boolean(presentation.showDeck, defaults.presentation.showDeck),
      cleanDeck: boolean(presentation.cleanDeck, defaults.presentation.cleanDeck)
    }
  };
}
