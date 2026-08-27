export const NEWSLETTER_PACKAGE_TYPE = "newsletter-package";

export type NewsletterPackageProps = {
  label: string;
  heading: string;
  presentation: {
    showLabel: boolean;
  };
};

export const WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS: NewsletterPackageProps = {
  label: "Newsletter signup",
  heading: "Get {publication.shortName} in your inbox",
  presentation: { showLabel: true }
};

export const NEUTRAL_NEWSLETTER_DEFAULTS: NewsletterPackageProps = {
  label: "Newsletter signup",
  heading: "Get {publication.shortName} in your inbox",
  presentation: { showLabel: true }
};

function text(value: unknown, fallback: string, max = 120) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;
}

export function parseNewsletterPackageProps(
  value: unknown,
  defaults: NewsletterPackageProps = WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS
): NewsletterPackageProps {
  const props = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const presentation = (props.presentation ?? {}) as Record<string, unknown>;

  return {
    label: text(props.label, defaults.label),
    heading: text(props.heading, defaults.heading),
    presentation: {
      showLabel: typeof presentation.showLabel === "boolean" ? presentation.showLabel : defaults.presentation.showLabel
    }
  };
}
