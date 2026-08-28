import { parseStorySourceOrFallback, type BylineStorySource } from "./schema-v2";

export const OPINION_PACKAGE_TYPE = "opinion-package";

export type OpinionPackageProps = {
  heading: string;
  description: string;
  source: BylineStorySource;
  limit: number;
  archiveLink: {
    enabled: boolean;
    href: string;
    label: string;
  };
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
};

export const WEEKLY_WILDCAT_OPINION_DEFAULTS: OpinionPackageProps = {
  heading: "Opinion",
  description: "Student perspectives, columns, and commentary from {publication.shortName} writers.",
  source: { type: "compatibility-opinion" },
  limit: 3,
  archiveLink: { enabled: true, href: "/category/opinion/", label: "All Opinion →" },
  presentation: { showAuthor: true, showDeck: true }
};

export const NEUTRAL_OPINION_DEFAULTS: OpinionPackageProps = {
  heading: "Opinion",
  description: "Perspectives, columns, and commentary from {publication.shortName} writers.",
  source: { type: "section", slug: "opinion" },
  limit: 3,
  archiveLink: { enabled: true, href: "/category/opinion/", label: "View all opinion →" },
  presentation: { showAuthor: true, showDeck: true }
};

const MAX_STORIES = 50;

function boundedCount(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_STORIES
    ? value
    : fallback;
}

function heading(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function link(value: unknown, fallback: { enabled: boolean; href: string; label: string }) {
  const candidate = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    enabled: boolean(candidate.enabled, fallback.enabled),
    href: typeof candidate.href === "string" && candidate.href.trim() ? candidate.href.trim().slice(0, 240) : fallback.href,
    label: typeof candidate.label === "string" && candidate.label.trim() ? candidate.label.trim().slice(0, 80) : fallback.label
  };
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseOpinionPackageProps(
  value: unknown,
  defaults: OpinionPackageProps = WEEKLY_WILDCAT_OPINION_DEFAULTS
): OpinionPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    heading: heading(props.heading, defaults.heading),
    description: typeof props.description === "string"
      ? props.description.trim().slice(0, 240)
      : defaults.description,
    source: parseStorySourceOrFallback(props.source, defaults.source),
    limit: boundedCount(props.limit, defaults.limit),
    archiveLink: link(props.archiveLink, defaults.archiveLink),
    presentation: {
      showAuthor: boolean(presentation.showAuthor, defaults.presentation.showAuthor),
      showDeck: boolean(presentation.showDeck, defaults.presentation.showDeck)
    }
  };
}
