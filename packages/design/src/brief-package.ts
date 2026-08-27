import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const BRIEF_PACKAGE_TYPE = "brief-package";

export type BriefPackageProps = {
  heading: string;
  source: BylineStorySource;
  limit: number;
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
};

export const WEEKLY_WILDCAT_BRIEF_DEFAULTS: BriefPackageProps = {
  heading: "The Brief",
  source: { type: "compatibility-brief" },
  limit: 4,
  presentation: { showAuthor: true, showDeck: true }
};

export const NEUTRAL_BRIEF_DEFAULTS: BriefPackageProps = {
  heading: "Latest stories",
  source: { type: "latest" },
  limit: 4,
  presentation: { showAuthor: true, showDeck: true }
};

const MAX_STORIES = 12;

function boundedCount(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_STORIES
    ? value
    : fallback;
}

function heading(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseBriefPackageProps(value: unknown, defaults: BriefPackageProps = WEEKLY_WILDCAT_BRIEF_DEFAULTS): BriefPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    heading: heading(props.heading, defaults.heading),
    source: parseStorySource(props.source) ?? defaults.source,
    limit: boundedCount(props.limit, defaults.limit),
    presentation: {
      showAuthor: boolean(presentation.showAuthor, defaults.presentation.showAuthor),
      showDeck: boolean(presentation.showDeck, defaults.presentation.showDeck)
    }
  };
}
