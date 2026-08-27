import { parseStorySource, type BylineStorySource } from "./schema-v2";

export const IN_FOCUS_PACKAGE_TYPE = "in-focus-package";

export type InFocusPackageProps = {
  heading: string;
  source: BylineStorySource;
  presentation: {
    showAuthor: boolean;
    showDeck: boolean;
  };
};

export const WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS: InFocusPackageProps = {
  heading: "In Focus",
  source: { type: "compatibility-in-focus" },
  presentation: { showAuthor: true, showDeck: true }
};

export const NEUTRAL_IN_FOCUS_DEFAULTS: InFocusPackageProps = {
  heading: "Featured",
  source: { type: "latest" },
  presentation: { showAuthor: true, showDeck: true }
};

function heading(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : fallback;
}

function boolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function parseInFocusPackageProps(
  value: unknown,
  defaults: InFocusPackageProps = WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS
): InFocusPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    heading: heading(props.heading, defaults.heading),
    source: parseStorySource(props.source) ?? defaults.source,
    presentation: {
      showAuthor: boolean(presentation.showAuthor, defaults.presentation.showAuthor),
      showDeck: boolean(presentation.showDeck, defaults.presentation.showDeck)
    }
  };
}
