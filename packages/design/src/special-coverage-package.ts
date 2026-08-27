import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const SPECIAL_COVERAGE_PACKAGE_TYPE = "special-coverage-package";

export type SpecialCoveragePackageProps = {
  heading: string;
  source: BylineStorySource;
  limit: number;
  leadPresentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
  supportingPresentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
};

export const WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS: SpecialCoveragePackageProps = {
  heading: "Special Coverage",
  source: { type: "compatibility-special-coverage" },
  limit: 3,
  leadPresentation: { showAuthor: true, showDeck: true },
  supportingPresentation: { showAuthor: false, showDeck: false }
};

export const NEUTRAL_SPECIAL_COVERAGE_DEFAULTS: SpecialCoveragePackageProps = {
  heading: "Special coverage",
  source: { type: "latest" },
  limit: 3,
  leadPresentation: { showAuthor: true, showDeck: true },
  supportingPresentation: { showAuthor: false, showDeck: false }
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

function presentation(value: unknown, fallback: { showAuthor: boolean; showDeck: boolean }) {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    showAuthor: boolean(source.showAuthor, fallback.showAuthor),
    showDeck: boolean(source.showDeck, fallback.showDeck)
  };
}

export function parseSpecialCoveragePackageProps(
  value: unknown,
  defaults: SpecialCoveragePackageProps = WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS
): SpecialCoveragePackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;

  return {
    heading: heading(props.heading, defaults.heading),
    source: parseStorySource(props.source) ?? defaults.source,
    limit: boundedCount(props.limit, defaults.limit),
    leadPresentation: presentation(props.leadPresentation, defaults.leadPresentation),
    supportingPresentation: presentation(props.supportingPresentation, defaults.supportingPresentation)
  };
}
