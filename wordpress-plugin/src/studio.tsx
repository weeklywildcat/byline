import apiFetch from "@wordpress/api-fetch";
import { Button, Notice, SelectControl, Spinner } from "@wordpress/components";
import { createPortal, useCallback, useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { Puck, type Config, type Data } from "@puckeditor/core";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { BYLINE_STUDIO_CATEGORIES, BYLINE_STUDIO_VIEWPORTS } from "@byline/studio-contract";
import { sanitizeThemeTokenOverrides, type BylineThemeDefinition, type BylineThemeTokens } from "@byline/theme-contract";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { getBylineBlockPresentation, themeTokensToCssVariables } from "@byline/ui";
import {
  BriefPackagePreview,
  InFocusPackagePreview,
  LeadPackagePreview,
  MorePackagePreview,
  NewsletterPackagePreview,
  OpinionPackagePreview,
  SpecialCoveragePackagePreview,
  SportsPackagePreview,
  setStudioPreviewDocument,
  setStudioPreviewLiveDocument,
  setStudioPreviewOptions,
  studioPreviewDiff,
  studioPreviewIntelligence,
  type StudioPreviewPublication
} from "./studio-preview";
import {
  AthleteSpotlightSourceField,
  AuthorPickerField,
  LeadStorySourceField,
  FocalPointField,
  MediaPickerField,
  NavigationPickerField,
  PagePickerField,
  SectionPickerField,
  SportsTeamPickerField,
  StoryPickerField,
  StorySourceField,
  TagPickerField,
  type StorySource
} from "./studio-fields";
import {
  BRIEF_PACKAGE_TYPE,
  IN_FOCUS_PACKAGE_TYPE,
  LEAD_PACKAGE_TYPE,
  MORE_PACKAGE_TYPE,
  NEWSLETTER_PACKAGE_TYPE,
  OPINION_PACKAGE_TYPE,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  BYLINE_PACKAGE_TYPES,
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_BRIEF_DEFAULTS,
  WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  WEEKLY_WILDCAT_MORE_DEFAULTS,
  WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS,
  WEEKLY_WILDCAT_OPINION_DEFAULTS,
  WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  getFallbackDesignDocument,
  type BylineDesignDocumentV2
} from "@byline/design";
import { editorStateToDesignDocument, loadDesignIntoEditor, type PuckEditorState, type StudioLoadResult } from "./studio-document";
import { legacyBlockLabel } from "@byline/design";
import { createWordPressDesignScheduleApi, type DesignScheduleApi } from "./design-scheduling-api";
import {
  designScheduleNeedsReview,
  designScheduleStatusLabel,
  type DesignScheduleRecord
} from "./design-scheduling-model";
import { subscribe as subscribeToStudioPreview } from "./studio-preview-model";
import { useStudioAutosave, type StudioAutosaveRecord } from "./studio-autosave";

// What Studio writes. Reading still accepts schema 1, but only as an input to
// migration -- see loadDesignIntoEditor.
type DesignDocument = BylineDesignDocumentV2;

type AdminDesign = {
  // Stored documents may still be schema 1 until they are re-saved.
  document: unknown;
  revision: number;
  modifiedAt: string | null;
  autosave: {
    document: unknown;
    baseRevisionId: number;
    modifiedAt: string;
  } | null;
  publishedAuthorId?: number;
  publishedAuthorName?: string;
  deployment?: StudioDeploymentStatus;
};

type StudioDeploymentStatus = {
  configured: boolean;
  pending: boolean;
  lastTriggeredAt: string;
  lastStatus: string;
  canRetry?: boolean;
  publicManifest?: {
    reachable: boolean;
    status: string;
    protocolVersion?: number;
    frontendVersion?: string;
    publicationRevision?: number;
    designRevisions?: Record<string, number>;
  };
};

type StudioProps = {
  canEdit: boolean;
  canPublish: boolean;
  publicationTheme: string;
  previewStylesheetUrl: string;
  tokenOverrides: Record<string, string>;
  backUrl?: string;
  features?: { polls: boolean; events: boolean; sports: boolean; newsletter?: boolean };
  publicationShortName?: string;
  publicationName?: string;
  organizationName?: string;
  contactHref?: string;
  social?: Array<{ service: string; label: string; url: string }>;
  calendarHeading?: string;
  publicSiteUrl?: string;
};

// Everything the preview needs that is publication-specific rather than
// design-specific. Passed in so no Weekly Wildcat identity is baked into Studio.
export type StudioPreviewContext = {
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean; newsletter?: boolean };
  publicationShortName: string;
  calendarHeading: string;
};

export const studioBlockGroups = BYLINE_STUDIO_CATEGORIES;
const blockGroups = studioBlockGroups;

const storyLayouts = new Set(["lead", "list", "grid", "feature", "special", "opinion", "team-feature"]);
const storyBlockIds = new Set(
  Object.values(blockGroups).flat().filter((type) => storyLayouts.has(getBylineBlockPresentation(type)?.layout ?? ""))
);
const sportsBlockIds = new Set(
  Object.values(blockGroups).flat().filter((type) => ["sports", "team-feature"].includes(getBylineBlockPresentation(type)?.layout ?? ""))
);

const components = Object.fromEntries(
  Object.values(blockGroups).flat().map((type) => {
    const presentation = getBylineBlockPresentation(type);
    if (!presentation) throw new Error(`Missing shared presentation for ${type}`);
    const fields: Record<string, unknown> = { title: { type: "text", label: "Heading" } };
    const defaultProps: Record<string, unknown> = { title: presentation.label };
    if (storyBlockIds.has(type)) {
      fields.query = StorySourceField();
      fields.allowDuplicates = { type: "radio", label: "Allow repeated stories", options: [
        { label: "No", value: false }, { label: "Yes", value: true }
      ] };
      defaultProps.query = { type: "latest", limit: 5 } satisfies StorySource;
      defaultProps.allowDuplicates = false;
    }
    if (type === "featured-story") fields.storyId = StoryPickerField();
    if (type === "section-feed") fields.sectionId = SectionPickerField();
    if (type === "story-list") {
      fields.tagId = TagPickerField();
      fields.authorId = AuthorPickerField();
    }
    if (type === "photo-feature") {
      fields.mediaId = MediaPickerField();
      fields.focalPoint = FocalPointField();
      defaultProps.focalPoint = { x: 50, y: 50 };
    }
    if (sportsBlockIds.has(type)) fields.teamKey = SportsTeamPickerField();
    if (type === "newsletter") {
      fields.pageId = PagePickerField();
      fields.destination = NavigationPickerField();
    }

    return [type, {
    label: presentation.label, fields, defaultProps,
    render: ({ title, query }: { title?: string; query?: StorySource }) => (
      <section style={{
        background: "var(--paper, #fff)",
        border: "1px solid var(--rule, #d8d0c7)",
        borderRadius: "var(--radius-small, 0px)",
        color: "var(--ink, #151515)",
        fontFamily: "var(--font-body, Arial, sans-serif)",
        minHeight: type === "divider" ? 24 : 112,
        padding: type === "divider" ? "10px 16px" : 20
      }}>
        {type === "divider" ? <hr style={{ border: 0, borderTop: "1px solid var(--rule-strong, #171717)" }} /> : (
          <>
            <small style={{ color: "var(--muted, #635f59)", textTransform: "uppercase" }}>{presentation.label}</small>
            <h2 style={{ margin: "8px 0 4px" }}>{title || presentation.defaultHeading}</h2>
            <p style={{ color: "var(--muted, #635f59)", margin: 0 }}>
              {query ? `Preview resolves ${query.type} content in layout order.` : "Preview uses the configured publication module."}
            </p>
          </>
        )}
      </section>
    )
  }];
  })
);

// The lead package is a schema v2 semantic package, not a v1 block. It is
// registered separately because it carries newsroom settings rather than the
// generic title/query pair, and because it renders the production component
// instead of a placeholder card.
function createLeadPackageComponent(context: StudioPreviewContext) {
  return {
    label: "Lead package",
    fields: {
      mode: {
        type: "radio" as const,
        label: "Package content",
        options: [
          { label: "Lead and latest", value: "content" },
          { label: "Poll only", value: "poll" },
          { label: "Calendar only", value: "calendar" }
        ]
      },
      lead: {
        type: "object" as const,
        label: "Lead story",
        objectFields: { source: LeadStorySourceField("Source") }
      },
      latest: {
        type: "object" as const,
        label: "The Latest rail",
        objectFields: {
          heading: { type: "text" as const, label: "Rail heading" },
          source: LeadStorySourceField("Source"),
          limit: {
            type: "number" as const,
            label: "Number of stories",
            min: 0,
            max: 12
          },
          showBylines: {
            type: "radio" as const,
            label: "Show bylines",
            options: [
              { label: "Yes", value: true },
              { label: "No", value: false }
            ]
          }
        }
      },
      utility: {
        type: "object" as const,
        label: "Utility rail",
        objectFields: {
          poll: {
            type: "radio" as const,
            label: "Poll",
            options: [
              { label: "Show", value: true },
              { label: "Hide", value: false }
            ]
          },
          calendar: {
            type: "radio" as const,
            label: "This Week calendar",
            options: [
              { label: "Show", value: true },
              { label: "Hide", value: false }
            ]
          },
          calendarLimit: { type: "number" as const, label: "Calendar entries", min: 0, max: 10 }
        }
      },
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showDeck: {
            type: "radio" as const,
            label: "Show deck",
            options: [
              { label: "Show", value: true },
              { label: "Hide", value: false }
            ]
          }
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS },
    // The acceptance criterion for this phase: Studio renders the same shared
    // renderer as the static site, against real WordPress content.
    render: (props: Record<string, unknown>) => (
      <LeadPackagePreview props={props} {...packagePreviewProps(context)} />
    )
  };
}

// The sports package, like the lead package, is a schema v2 semantic package
// rather than a v1 block. Its settings are newsroom decisions -- how many
// stories, whether to run the spotlight, how many finals and fixtures -- and
// deliberately expose none of the sports API's own concepts.
function createSportsPackageComponent(context: StudioPreviewContext) {
  const showHide = (label: string) => ({
    type: "radio" as const,
    label,
    options: [
      { label: "Show", value: true },
      { label: "Hide", value: false }
    ]
  });

  return {
    label: "Sports package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      stories: {
        type: "object" as const,
        label: "Stories",
        objectFields: {
          source: LeadStorySourceField("Source"),
          limit: { type: "number" as const, label: "Number of stories", min: 0, max: 12 }
        }
      },
      athleteSpotlight: {
        type: "object" as const,
        label: "Athlete spotlight",
        objectFields: {
          enabled: showHide("Athlete spotlight"),
          source: AthleteSpotlightSourceField("Source")
        }
      },
      scores: {
        type: "object" as const,
        label: "Recent scores",
        objectFields: {
          enabled: showHide("Recent scores"),
          limit: { type: "number" as const, label: "Number of results", min: 0, max: 8 }
        }
      },
      upcoming: {
        type: "object" as const,
        label: "Upcoming games",
        objectFields: {
          enabled: showHide("Upcoming games"),
          limit: { type: "number" as const, label: "Number of games", min: 0, max: 12 }
        }
      },
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showDeck: showHide("Show deck"),
          showBylines: showHide("Show bylines"),
          showReadLink: showHide("Show read link"),
          cleanDeck: showHide("Use clean decks")
        }
      },
      content: {
        type: "radio" as const,
        label: "Package content",
        options: [
          { label: "Stories and schedule", value: "full" },
          { label: "Stories only", value: "story" },
          { label: "Schedule only", value: "schedule" }
        ]
      },
      archiveLink: {
        type: "object" as const,
        label: "Section link",
        objectFields: {
          enabled: showHide("Show section link"),
          href: { type: "text" as const, label: "Link URL" },
          label: { type: "text" as const, label: "Link label" }
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_SPORTS_DEFAULTS },
    render: (props: Record<string, unknown>) => (
      <SportsPackagePreview props={props} {...packagePreviewProps(context)} />
    )
  };
}

const showHideField = (label: string) => ({
  type: "radio" as const,
  label,
  options: [
    { label: "Show", value: true },
    { label: "Hide", value: false }
  ]
});

const packagePreviewProps = (context: StudioPreviewContext) => ({
  theme: context.theme,
  features: context.features,
  publicationShortName: context.publicationShortName,
  calendarHeading: context.calendarHeading
});

function createBriefPackageComponent(context: StudioPreviewContext) {
  return {
    label: "Brief package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      source: LeadStorySourceField("Story source"),
      limit: { type: "number" as const, label: "Number of stories", min: 0, max: 12 },
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showAuthor: showHideField("Show bylines"),
          showDeck: showHideField("Show decks")
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_BRIEF_DEFAULTS },
    render: (props: Record<string, unknown>) => <BriefPackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

function createInFocusPackageComponent(context: StudioPreviewContext) {
  return {
    label: "In Focus package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      source: LeadStorySourceField("Story source"),
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showAuthor: showHideField("Show byline"),
          showDeck: showHideField("Show deck")
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_IN_FOCUS_DEFAULTS },
    render: (props: Record<string, unknown>) => <InFocusPackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

function createSpecialCoveragePackageComponent(context: StudioPreviewContext) {
  const storyPresentation = (label: string) => ({
    type: "object" as const,
    label,
    objectFields: {
      showAuthor: showHideField("Show byline"),
      showDeck: showHideField("Show deck")
    }
  });

  return {
    label: "Special Coverage package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      source: LeadStorySourceField("Story source"),
      limit: { type: "number" as const, label: "Number of stories", min: 0, max: 12 },
      leadPresentation: storyPresentation("Lead story display"),
      supportingPresentation: storyPresentation("Supporting story display")
    },
    defaultProps: { ...WEEKLY_WILDCAT_SPECIAL_COVERAGE_DEFAULTS },
    render: (props: Record<string, unknown>) => <SpecialCoveragePackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

function createOpinionPackageComponent(context: StudioPreviewContext) {
  return {
    label: "Opinion package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      description: { type: "text" as const, label: "Description" },
      source: LeadStorySourceField("Story source"),
      limit: { type: "number" as const, label: "Number of stories", min: 0, max: 12 },
      archiveLink: {
        type: "object" as const,
        label: "Archive link",
        objectFields: {
          enabled: showHideField("Show archive link"),
          href: { type: "text" as const, label: "Link URL" },
          label: { type: "text" as const, label: "Link label" }
        }
      },
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showAuthor: showHideField("Show bylines"),
          showDeck: showHideField("Show decks")
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_OPINION_DEFAULTS },
    render: (props: Record<string, unknown>) => <OpinionPackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

function createMorePackageComponent(context: StudioPreviewContext) {
  const utilityBlock = (label: string) => ({
    type: "object" as const,
    label,
    objectFields: {
      enabled: showHideField(`Show ${label.toLowerCase()}`),
      heading: { type: "text" as const, label: "Heading" },
      copy: { type: "text" as const, label: "Copy" }
    }
  });

  return {
    label: "More package",
    fields: {
      heading: { type: "text" as const, label: "Section heading" },
      source: LeadStorySourceField("Story source"),
      limit: { type: "number" as const, label: "Number of stories", min: 0, max: 12 },
      archiveLink: {
        type: "object" as const,
        label: "Archive link",
        objectFields: {
          enabled: showHideField("Show archive link"),
          href: { type: "text" as const, label: "Link URL" },
          label: { type: "text" as const, label: "Link label" }
        }
      },
      utility: {
        type: "object" as const,
        label: "Utility rail",
        objectFields: {
          enabled: showHideField("Enable utility rail"),
          joinStaff: utilityBlock("Join the newsroom"),
          stayConnected: utilityBlock("Stay connected")
        }
      },
      presentation: {
        type: "object" as const,
        label: "Story display",
        objectFields: {
          showDeck: showHideField("Show decks"),
          cleanDeck: showHideField("Use clean decks")
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_MORE_DEFAULTS },
    render: (props: Record<string, unknown>) => <MorePackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

function createNewsletterPackageComponent(context: StudioPreviewContext) {
  return {
    label: "Newsletter package",
    fields: {
      label: { type: "text" as const, label: "Accessible label" },
      heading: { type: "text" as const, label: "Heading" },
      presentation: {
        type: "object" as const,
        label: "Display",
        objectFields: { showLabel: showHideField("Show label") }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_NEWSLETTER_DEFAULTS },
    render: (props: Record<string, unknown>) => <NewsletterPackagePreview props={props} {...packagePreviewProps(context)} />
  };
}

const studioConfigBase: Config = {
  categories: Object.fromEntries(
    Object.entries(blockGroups).map(([title, categoryComponents]) => [title, {
      title,
      components: [...categoryComponents],
      defaultExpanded: title === "Stories"
    }])
  ),
  components: components as unknown as Config["components"]
};

const previewThemes: Record<string, BylineThemeDefinition> = {
  [weeklyWildcatTheme.id]: weeklyWildcatTheme,
  [modernTheme.id]: modernTheme,
  [editorialTheme.id]: editorialTheme,
  [magazineTheme.id]: magazineTheme
};

export function getStudioThemeVariables(theme: string, overrides: Record<string, string>) {
  const definition = previewThemes[theme] ?? weeklyWildcatTheme;
  const tokens: BylineThemeTokens = {
    ...definition.tokens,
    ...sanitizeThemeTokenOverrides(overrides)
  };
  return themeTokensToCssVariables(tokens);
}

export function getStudioThemeStylesheets(theme: string) {
  return [...((previewThemes[theme] ?? weeklyWildcatTheme).stylesheets ?? [])];
}

export function createStudioConfig(
  theme: string,
  overrides: Record<string, string>,
  context?: StudioPreviewContext
): Config {
  const variables = getStudioThemeVariables(theme, overrides) as CSSProperties;
  const previewContext: StudioPreviewContext = context ?? {
    theme,
    features: { polls: true, events: true, sports: true, newsletter: true },
    publicationShortName: "Newsroom",
    calendarHeading: "This week"
  };

  return {
    ...studioConfigBase,
    categories: {
      Packages: {
        title: "Packages",
        components: [...BYLINE_PACKAGE_TYPES],
        defaultExpanded: true
      },
      ...studioConfigBase.categories
    } as Config["categories"],
    components: {
      ...studioConfigBase.components,
      [LEAD_PACKAGE_TYPE]: createLeadPackageComponent(previewContext),
      [BRIEF_PACKAGE_TYPE]: createBriefPackageComponent(previewContext),
      [IN_FOCUS_PACKAGE_TYPE]: createInFocusPackageComponent(previewContext),
      [SPECIAL_COVERAGE_PACKAGE_TYPE]: createSpecialCoveragePackageComponent(previewContext),
      [OPINION_PACKAGE_TYPE]: createOpinionPackageComponent(previewContext),
      [SPORTS_PACKAGE_TYPE]: createSportsPackageComponent(previewContext),
      [MORE_PACKAGE_TYPE]: createMorePackageComponent(previewContext),
      [NEWSLETTER_PACKAGE_TYPE]: createNewsletterPackageComponent(previewContext)
    } as unknown as Config["components"],
    root: {
      render: ({ children }: { children: ReactNode }) => (
        // The canvas is the published page's own shell, not an editor
        // approximation of it. Width, padding and section rhythm come from the
        // shared publication stylesheet, so a package is laid out against
        // exactly the containing box it receives on the live homepage.
        <div
          className="byline-publication-preview live-home-shell"
          data-byline-preview-surface="studio"
          data-theme={previewContext.theme}
          style={{
            ...variables,
            background: "var(--page)",
            minHeight: "100vh"
          }}
        >
          {children}
        </div>
      )
    }
  } as Config;
}

const TEMPLATE_OPTIONS = [
  { label: "Homepage", value: "home" },
  { label: "Default section", value: "section-default" },
  { label: "Default article", value: "article-default" },
  { label: "Default author", value: "author-default" },
  { label: "Sports homepage", value: "sports-home" }
] as const;

type StudioTemplate = (typeof TEMPLATE_OPTIONS)[number]["value"];

function initialStudioTemplate(): StudioTemplate {
  if (typeof window !== "undefined") {
    const requested = new URLSearchParams(window.location.search).get("template");
    if (TEMPLATE_OPTIONS.some((option) => option.value === requested)) return requested as StudioTemplate;
  }
  return "home";
}

function templateLabel(template: string) {
  return TEMPLATE_OPTIONS.find((option) => option.value === template)?.label ?? template;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "byline_design_conflict") {
    return "Another editor published this design. Reload it before reapplying your work.";
  }
  return "Byline Studio could not save this design. Review the block settings and try again.";
}

/**
 * The Studio application shell.
 *
 * Studio is a full-screen design surface, not a WordPress settings screen. It
 * mounts as a fixed overlay over wp-admin so the admin menu, the page padding
 * and the footer stop consuming the canvas, and it provides its own exit.
 * Nothing outside this component's own class scope is restyled.
 */
function relativePublishedTime(value: string | null | undefined): string {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function isDeploymentLive(status: StudioDeploymentStatus | null, template: string, revision: number): boolean {
  return status?.publicManifest?.reachable === true
    && status.publicManifest.designRevisions?.[template] === revision;
}

function legacyBlockTitle(type: string, props: Record<string, unknown>): string {
  const title = typeof props.title === "string" ? props.title.trim() : "";
  return title ? `${legacyBlockLabel(type)} — ${title}` : legacyBlockLabel(type);
}

function downloadLegacyBlock(
  template: string,
  block: NonNullable<BylineDesignDocumentV2["legacy"]>["unconvertedBlocks"][number]
): void {
  const blob = new Blob([JSON.stringify({ template, block }, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `byline-${template}-${block.type.replace(/[^a-z0-9_-]+/gi, "-")}-recovery.json`;
  link.click();
  window.URL.revokeObjectURL(url);
}

function LegacyResolution({
  template,
  legacy,
  onRemove
}: {
  template: string;
  legacy: NonNullable<BylineDesignDocumentV2["legacy"]>;
  onRemove: (index: number) => void;
}) {
  return (
    <Notice status="warning" isDismissible={false}>
      <strong>One or more older blocks need a decision before publishing.</strong>
      <p>These blocks are preserved safely outside the editor. This Byline version cannot convert them automatically.</p>
      <ul className="byline-legacy-resolution-list">
        {legacy.unconvertedBlocks.map((block, index) => (
          <li key={`${block.type}-${index}`}>
            <div>
              <strong>{legacyBlockTitle(block.type, block.props)}</strong>
              <small>Conversion unavailable in this version. The original data remains in this draft.</small>
            </div>
            <div className="byline-legacy-resolution-actions">
              <Button
                variant="secondary"
                onClick={() => downloadLegacyBlock(template, block)}
                aria-label={`Download recovery data for ${legacyBlockLabel(block.type)}`}
              >
                Download data
              </Button>
              <Button
                variant="link"
                isDestructive
                onClick={() => onRemove(index)}
                aria-label={`Remove ${legacyBlockLabel(block.type)} from this design`}
              >
                Remove from design
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="byline-field-note">Removing a preserved block changes the unpublished draft only. The published revision and its history stay unchanged until you publish.</p>
    </Notice>
  );
}

function scheduleErrorMessage(error: unknown): string {
  const candidate = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const code = typeof candidate.code === "string" ? candidate.code : "";
  if (code === "byline_design_conflict" || code === "byline_design_schedule_conflict") {
    return "The live design changed after this schedule was created. Review the current design, then rebase the schedule before retrying.";
  }
  if (code === "byline_design_schedule_terminal") {
    return "This schedule has already completed or been cancelled and cannot be changed.";
  }
  if (code === "byline_design_schedule_processing") {
    return "This schedule is currently publishing and cannot be changed yet.";
  }
  if (code === "byline_design_schedule_capability") {
    return "Your publishing permission changed, so this schedule was not changed.";
  }
  if (code === "byline_design_schedule_idempotency_conflict") {
    return "That schedule request was already used for different content. Refresh the schedule list and try again.";
  }
  return "Byline could not update the design schedule. No schedule change was assumed; refresh and try again.";
}

function scheduleDateInput(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function scheduleDateIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function scheduleDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Unknown time";
}

function newScheduleIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type DesignOperationsPanelProps = {
  canPublish: boolean;
  scheduleReady: boolean;
  scheduleBlocked: boolean;
  scheduleLoading: boolean;
  scheduleError: string;
  schedules: DesignScheduleRecord[];
  scheduleDate: string;
  scheduleBusy: string;
  intelligence: ReturnType<typeof studioPreviewIntelligence>;
  semanticDiff: ReturnType<typeof studioPreviewDiff>;
  onScheduleDateChange: (value: string) => void;
  onSchedule: () => void;
  onRefresh: () => void;
  onReschedule: (record: DesignScheduleRecord, value: string) => void;
  onRebase: (record: DesignScheduleRecord) => void;
  onCancel: (record: DesignScheduleRecord) => void;
};

function DesignOperationsPanel({
  canPublish,
  scheduleReady,
  scheduleBlocked,
  scheduleLoading,
  scheduleError,
  schedules,
  scheduleDate,
  scheduleBusy,
  intelligence,
  semanticDiff,
  onScheduleDateChange,
  onSchedule,
  onRefresh,
  onReschedule,
  onRebase,
  onCancel
}: DesignOperationsPanelProps) {
  const [rescheduleDates, setRescheduleDates] = useState<Record<number, string>>({});

  useEffect(() => {
    setRescheduleDates((current) => Object.fromEntries(
      schedules.map((record) => [record.id, current[record.id] ?? scheduleDateInput(record.scheduledAt)])
    ));
  }, [schedules]);

  if (!canPublish) return null;

  const reviewCount = intelligence?.issues.filter((issue) => issue.severity === "warning").length ?? 0;
  const diffCount = semanticDiff?.operations.length ?? 0;

  return (
    <section className="byline-studio-operations" aria-labelledby="byline-studio-operations-title">
      <div className="byline-studio-operations-header">
        <div>
          <h2 id="byline-studio-operations-title">Publishing operations</h2>
          <p>Schedule an immutable snapshot of this design. The live site changes only when the protected WordPress job runs.</p>
        </div>
        <div className="byline-studio-operations-intelligence" aria-label="Design checks">
          <strong>{intelligence === null ? "Design checks unavailable" : reviewCount ? `${reviewCount} design check${reviewCount === 1 ? "" : "s"} need review` : "Design checks clear"}</strong>
          {semanticDiff === null
            ? <span>Draft/live comparison unavailable</span>
            : diffCount
              ? <span>{diffCount} draft/live difference{diffCount === 1 ? "" : "s"}</span>
              : <span>Draft matches live</span>}
        </div>
      </div>

      {intelligence?.issues.length ? (
        <ul className="byline-studio-intelligence-list">
          {intelligence.issues.slice(0, 5).map((issue, index) => (
            <li key={`${issue.code}-${issue.packageId}-${issue.storyId ?? index}`}>
              <strong>{issue.severity === "warning" ? "Review" : "Info"}:</strong> {issue.message}
            </li>
          ))}
          {intelligence.issues.length > 5 ? <li>+{intelligence.issues.length - 5} more checks in the preview.</li> : null}
        </ul>
      ) : null}

      {!scheduleReady ? (
        <Notice status={scheduleBlocked ? "warning" : scheduleError ? "error" : "warning"} isDismissible={false}>
          {scheduleBlocked
            ? "Resolve preserved older blocks before scheduling this design."
            : scheduleError || (scheduleLoading ? "Loading protected schedules…" : "Schedules are unavailable until WordPress confirms access.")}
          {scheduleError && !scheduleBlocked ? <Button variant="secondary" onClick={onRefresh}>Retry</Button> : null}
        </Notice>
      ) : (
        <>
          <div className="byline-studio-schedule-create">
            <label htmlFor="byline-studio-schedule-date"><strong>Publish this design at</strong></label>
            <input
              id="byline-studio-schedule-date"
              type="datetime-local"
              value={scheduleDate}
              min={scheduleDateInput(new Date())}
              onChange={(event) => onScheduleDateChange(event.target.value)}
              disabled={Boolean(scheduleBusy)}
            />
            <Button variant="primary" onClick={onSchedule} disabled={!scheduleDate || Boolean(scheduleBusy)} isBusy={scheduleBusy === "create"}>
              Schedule publish
            </Button>
          </div>

          {schedules.length === 0 ? <p>No scheduled design snapshots for this template.</p> : (
            <ol className="byline-studio-schedule-list">
              {schedules.map((record) => {
                const terminal = record.status === "published" || record.status === "cancelled";
                const processing = record.status === "processing";
                const needsReview = designScheduleNeedsReview(record);
                return (
                  <li key={record.id} className={`byline-studio-schedule-item is-${record.status}`}>
                    <div className="byline-studio-schedule-summary">
                      <strong>{designScheduleStatusLabel(record.status)}</strong>
                      <span>{scheduleDateLabel(record.scheduledAt)}</span>
                      <small>Snapshot {record.snapshotHash ?? "verified"} · base revision {record.baseLiveRevision}</small>
                    </div>
                    {record.error ? <p className="byline-studio-schedule-error">{record.error}</p> : null}
                    {needsReview ? <p className="byline-studio-schedule-review">Review the current design before rebasing this snapshot. Rebase changes only the live revision guard; it never changes the scheduled document.</p> : null}
                    {!terminal && !processing ? (
                      <div className="byline-studio-schedule-actions">
                        <label>
                          <span className="screen-reader-text">New time for schedule {record.id}</span>
                          <input
                            type="datetime-local"
                            value={rescheduleDates[record.id] ?? scheduleDateInput(record.scheduledAt)}
                            min={scheduleDateInput(new Date())}
                            onChange={(event) => setRescheduleDates((current) => ({ ...current, [record.id]: event.target.value }))}
                            disabled={Boolean(scheduleBusy)}
                          />
                        </label>
                        <Button
                          variant="secondary"
                          onClick={() => onReschedule(record, rescheduleDates[record.id] ?? "")}
                          disabled={Boolean(scheduleBusy) || !rescheduleDates[record.id]}
                          isBusy={scheduleBusy === `${record.id}:reschedule`}
                        >
                          Reschedule
                        </Button>
                        {needsReview ? (
                          <Button variant="secondary" onClick={() => onRebase(record)} disabled={Boolean(scheduleBusy)} isBusy={scheduleBusy === `${record.id}:rebase`}>
                            Rebase to current live
                          </Button>
                        ) : null}
                        <Button variant="link" isDestructive onClick={() => onCancel(record)} disabled={Boolean(scheduleBusy)} isBusy={scheduleBusy === `${record.id}:cancel`}>
                          Cancel
                        </Button>
                      </div>
                    ) : null}
                    <small className="byline-studio-schedule-id">Schedule #{record.id} · idempotent snapshot</small>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

export function BylineStudio({
  canEdit,
  canPublish,
  publicationTheme,
  previewStylesheetUrl,
  tokenOverrides,
  backUrl,
  features = { polls: true, events: true, sports: true, newsletter: true },
  publicationShortName = "Newsroom",
  publicationName,
  organizationName,
  contactHref = "#contact",
  social = [],
  calendarHeading = "This week",
  publicSiteUrl = ""
}: StudioProps) {
  const [template, setTemplate] = useState<StudioTemplate>(initialStudioTemplate);
  const [design, setDesign] = useState<AdminDesign | null>(null);
  const [loaded, setLoaded] = useState<StudioLoadResult | null>(null);
  const [editorState, setEditorState] = useState<PuckEditorState | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [error, setError] = useState("");
  const [publishPhase, setPublishPhase] = useState<"idle" | "publishing" | "published">("idle");
  const [deployment, setDeployment] = useState<StudioDeploymentStatus | null>(null);
  const [deploymentRetrying, setDeploymentRetrying] = useState(false);
  const [deploymentRefreshToken, setDeploymentRefreshToken] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [schedules, setSchedules] = useState<DesignScheduleRecord[] | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState("");
  const [scheduleDate, setScheduleDate] = useState(() => scheduleDateInput(new Date(Date.now() + 60 * 60 * 1000)));
  const scheduleApi = useMemo<DesignScheduleApi>(() => createWordPressDesignScheduleApi(), []);
  const scheduleRequestRef = useRef(0);
  const scheduleIdempotencyKeyRef = useRef<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState(0);
  // Both panels collapse so the preview can take the full width. The inspector
  // starts closed on a laptop-width workspace: the canvas is the point of the
  // screen, and the inspector opens as soon as a package is selected.
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1500
  );
  // Editor-only markers for packages that resolve to nothing. On by default so
  // an invisible package is still findable; off gives a reader-accurate canvas.
  const [showHiddenPackages, setShowHiddenPackages] = useState(true);
  const loadRequestRef = useRef(0);
  const latestDocumentRef = useRef<DesignDocument | null>(null);
  const editorVersionRef = useRef(0);
  // Keyed on the individual flags rather than on the `features` prop itself:
  // the host builds that object inline, so its identity changes on every admin
  // render, and keying on identity would rebuild the Puck config and re-resolve
  // the whole document for no reason. `social` arrives straight from the
  // publication record and is already stable.
  const featureFlags = useMemo(
    () => ({
      polls: features.polls,
      events: features.events,
      sports: features.sports,
      newsletter: features.newsletter !== false
    }),
    [features.events, features.newsletter, features.polls, features.sports]
  );
  const previewPublication: StudioPreviewPublication = useMemo(
    () => ({
      shortName: publicationShortName,
      name: publicationName ?? publicationShortName,
      organizationName: organizationName ?? publicationShortName,
      contactHref,
      social,
      features: featureFlags,
      calendarHeading
    }),
    [calendarHeading, contactHref, featureFlags, organizationName, publicationName, publicationShortName, social]
  );
  const studioConfig = useMemo(
    () =>
      createStudioConfig(publicationTheme, tokenOverrides, {
        theme: publicationTheme,
        features: featureFlags,
        publicationShortName,
        calendarHeading
      }),
    [calendarHeading, featureFlags, publicationShortName, publicationTheme, tokenOverrides]
  );
  const previewStylesheets = useMemo(
    () => [previewStylesheetUrl, ...getStudioThemeStylesheets(publicationTheme)].filter(Boolean),
    [previewStylesheetUrl, publicationTheme]
  );
  const iframeOverride = useMemo(
    () =>
      function BylinePreviewIframe({ children, document }: { children: ReactNode; document?: Document }) {
        return (
          <>
            {document
              ? createPortal(
                  <>
                    {previewStylesheets.map((href) => (
                      <link key={href} rel="stylesheet" href={href} data-byline-preview-stylesheet />
                    ))}
                  </>,
                  document.head
                )
              : null}
            {children}
          </>
        );
      },
    [previewStylesheets]
  );

  useEffect(() => {
    setStudioPreviewOptions({ showHiddenPackages });
  }, [showHiddenPackages]);

  useEffect(() => subscribeToStudioPreview(() => setPreviewRevision((revision) => revision + 1)), []);

  const intelligence = useMemo(() => {
    void previewRevision;
    return studioPreviewIntelligence();
  }, [previewRevision]);
  const semanticDiff = useMemo(() => {
    void previewRevision;
    return studioPreviewDiff();
  }, [previewRevision]);

  const refreshSchedules = useCallback(async () => {
    if (!canPublish) {
      setSchedules([]);
      setScheduleError("");
      return;
    }
    const requestId = ++scheduleRequestRef.current;
    setScheduleLoading(true);
    setScheduleError("");
    try {
      const next = await scheduleApi.list(template);
      if (requestId === scheduleRequestRef.current) setSchedules(next);
    } catch (loadError) {
      if (requestId === scheduleRequestRef.current) {
        setSchedules(null);
        setScheduleError(scheduleErrorMessage(loadError));
      }
    } finally {
      if (requestId === scheduleRequestRef.current) setScheduleLoading(false);
    }
  }, [canPublish, scheduleApi, template]);

  useEffect(() => {
    scheduleIdempotencyKeyRef.current = null;
    void refreshSchedules();
    return () => { scheduleRequestRef.current += 1; };
  }, [refreshSchedules]);

  // The shell covers wp-admin, so the page behind it must not scroll with it.
  useEffect(() => {
    const body = window.document.body;

    body.classList.add("byline-studio-fullscreen");

    return () => {
      body.classList.remove("byline-studio-fullscreen");
    };
  }, []);

  const saveDocument = useCallback((document: DesignDocument, baseRevisionId: number) => (
    apiFetch<StudioAutosaveRecord<DesignDocument>>({
      path: `/byline/v1/admin/design/${encodeURIComponent(template)}/autosave`,
      method: "PUT",
      data: { document, baseRevisionId }
    })
  ), [template]);

  const onAutosaved = useCallback((record: StudioAutosaveRecord<DesignDocument>, isLatestLocalEdit: boolean) => {
    if (!isLatestLocalEdit) return;
    // Keep the editor document in its own state. A response for an older edit
    // may still provide useful draft metadata, but it must never remount Puck
    // onto that older document.
    setDesign((current) => current ? {
      ...current,
      autosave: {
        document: record.document,
        baseRevisionId: record.baseRevisionId,
        modifiedAt: record.modifiedAt
      }
    } : current);
  }, []);

  const onAutosaveError = useCallback((autosaveError: unknown) => {
    setError(errorMessage(autosaveError));
  }, []);

  const baseRevisionId = design?.autosave?.baseRevisionId ?? design?.revision ?? 0;
  const autosave = useStudioAutosave<DesignDocument>({
    baseRevisionId,
    save: saveDocument,
    onSaved: onAutosaved,
    onError: onAutosaveError
  });

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    setDesign(null);
    setLoaded(null);
    setEditorState(null);
    setDeployment(null);
    setDeploymentRetrying(false);
    setPublishPhase("idle");
    setError("");
    setStudioPreviewLiveDocument(null);
    autosave.hydrate({ hasDraft: false, baseRevisionId: 0 });

    apiFetch<AdminDesign>({ path: `/byline/v1/admin/design/${encodeURIComponent(template)}` })
      .then((next) => {
        if (loadRequestRef.current !== requestId) return;
        const stored = next.autosave?.document ?? (
          next.revision > 0 ? next.document : getFallbackDesignDocument(template, publicationTheme)
        );
        const nextLoaded = loadDesignIntoEditor(stored ?? {}, template);
        const nextEditorState = nextLoaded.editorState;
        const nextDocument = editorStateToDesignDocument(nextEditorState, template, publicationTheme, nextLoaded.legacy);
        const liveSource = next.revision > 0
          ? next.document
          : getFallbackDesignDocument(template, publicationTheme);
        const liveLoaded = loadDesignIntoEditor(liveSource ?? {}, template);
        const liveDocument = editorStateToDesignDocument(liveLoaded.editorState, template, publicationTheme, liveLoaded.legacy);
        setDesign(next);
        setLoaded(nextLoaded);
        setEditorState(nextEditorState);
        setEditorKey((key) => key + 1);
        setDeployment(next.deployment ?? null);
        latestDocumentRef.current = nextDocument;
        setStudioPreviewLiveDocument(liveDocument);
        editorVersionRef.current += 1;
        autosave.hydrate({
          hasDraft: Boolean(next.autosave),
          baseRevisionId: next.autosave?.baseRevisionId ?? next.revision
        });
      })
      .catch((loadError) => {
        if (loadRequestRef.current === requestId) setError(errorMessage(loadError));
      });
    return () => {
      if (loadRequestRef.current === requestId) loadRequestRef.current += 1;
    };
  }, [autosave.hydrate, publicationTheme, template]);

  /**
   * What the live site is actually resolving for this template right now.
   *
   * Revision 0 means nothing has ever been published, and the frontend is
   * running its canonical fallback rather than the stored placeholder. Using
   * the same shared seed the frontend uses is what makes "reset to the live
   * homepage" honest.
   */
  const currentDocument = useMemo(
    () => editorState && loaded
      ? editorStateToDesignDocument(editorState, template, publicationTheme, loaded.legacy)
      : null,
    [editorState, loaded, publicationTheme, template]
  );

  // The canvas previews the document an autosave would write, resolved once for
  // the whole page. Published before the first render so no package renders
  // against a stale or absent model.
  useEffect(() => {
    if (currentDocument) setStudioPreviewDocument(currentDocument, previewPublication);
  }, [currentDocument, previewPublication]);

  useEffect(() => {
    if (!autosave.hasPending) return undefined;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [autosave.hasPending]);

  const hasUnconvertedLegacy = Boolean(loaded?.legacy?.unconvertedBlocks.length);
  const hasDraft = Boolean(design?.autosave) || autosave.hasDraft;
  const neverPublished = design?.revision === 0;
  const liveLabel = neverPublished ? "Not published yet" : "Live";
  const publishedTime = relativePublishedTime(design?.modifiedAt);
  const saveLabel = autosave.status === "pending" || autosave.status === "saving"
    ? "Saving…"
    : autosave.status === "error"
      ? "Couldn’t save"
      : autosave.status === "offline"
        ? "Offline"
        : "Saved ✓";
  const liveNow = design ? isDeploymentLive(deployment, template, design.revision) : false;
  const deploymentStatus = deployment?.lastStatus || "";
  const deploymentFailed = !deployment?.pending && /request failed|http [45]\d\d|no http status/i.test(deploymentStatus);
  const deploymentLabel = publishPhase === "publishing"
    ? "Publishing…"
    : liveNow
      ? "Live ✓"
      : deploymentFailed
        ? "Published in Byline, but the website could not update."
        : deployment?.pending
          ? "Published · rebuilding site…"
          : deployment?.configured
            ? "Published · waiting for site rebuild…"
            : publishPhase === "published"
              ? "Published in Byline · website rebuild not configured"
              : "";

  const documentFor = useCallback((data: Data): DesignDocument => (
    editorStateToDesignDocument(data as unknown as PuckEditorState, template, publicationTheme, loaded?.legacy)
  ), [loaded?.legacy, publicationTheme, template]);

  const onEditorChange = (data: Data) => {
    if (!loaded || !canEdit) return;
    const document = documentFor(data);
    const nextEditorState = data as unknown as PuckEditorState;
    setEditorState(nextEditorState);
    latestDocumentRef.current = document;
    editorVersionRef.current += 1;
    setError("");
    scheduleIdempotencyKeyRef.current = null;
    setPublishPhase("idle");
    setStudioPreviewDocument(document, previewPublication);
    autosave.schedule(document);
  };

  const changeTemplate = async (nextTemplate: string) => {
    if (!nextTemplate || nextTemplate === template || isTransitioning) return;
    setIsTransitioning(true);
    setError("");
    try {
      await autosave.flush();
      autosave.supersede();
      setTemplate(nextTemplate as StudioTemplate);
    } catch (transitionError) {
      setError(errorMessage(transitionError));
    } finally {
      setIsTransitioning(false);
    }
  };

  const exitStudio = async (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (!backUrl || isTransitioning) return;
    setIsTransitioning(true);
    setError("");
    try {
      await autosave.flush();
      window.location.assign(backUrl);
    } catch (exitError) {
      setError(errorMessage(exitError));
      setIsTransitioning(false);
    }
  };

  const publish = async (data: Data) => {
    if (!canPublish || !loaded) return;
    if (hasUnconvertedLegacy) {
      setError("Resolve the preserved older blocks below before publishing. Your draft is safe.");
      return;
    }
    setError("");
    setPublishPhase("publishing");
    const documentAtStart = documentFor(data);
    const publishVersion = editorVersionRef.current;
    latestDocumentRef.current = documentAtStart;
    try {
      await autosave.flush();
      // If the editor changed while the first flush was in flight, serialize
      // the newer queued document before publishing it.
      if (publishVersion !== editorVersionRef.current || autosave.hasPending) await autosave.flush();
      const document = latestDocumentRef.current ?? documentAtStart;
      const published = await apiFetch<AdminDesign>({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/publish`,
        method: "POST",
        data: { document, baseRevisionId: autosave.baseRevisionId }
      });
      const changedDuringPublish = editorVersionRef.current > publishVersion;
      setDesign({ ...published, autosave: null });
      setDeployment(published.deployment ?? null);
      setStudioPreviewLiveDocument(document);
      setPublishPhase("published");
      if (changedDuringPublish && latestDocumentRef.current) {
        // The published request used the earlier snapshot. Keep a newer edit as
        // a draft against the new published revision instead of discarding it.
        autosave.rebase(published.revision);
        autosave.schedule(latestDocumentRef.current);
      } else {
        autosave.markPublished(published.revision);
      }
    } catch (publishError) {
      setPublishPhase("idle");
      setError(errorMessage(publishError));
    }
  };

  const schedulePublish = async () => {
    if (!canPublish || !loaded || hasUnconvertedLegacy || schedules === null || scheduleError) return;
    const scheduledAt = scheduleDateIso(scheduleDate);
    if (!scheduledAt || Date.parse(scheduledAt) <= Date.now()) {
      setScheduleError("Choose a future date and time for the scheduled publish.");
      return;
    }
    const document = latestDocumentRef.current ?? currentDocument;
    if (!document) {
      setScheduleError("The design is still loading, so no schedule was created.");
      return;
    }

    setScheduleBusy("create");
    setScheduleError("");
    try {
      const saved = await autosave.flush();
      const next = await scheduleApi.create(template, {
        document,
        baseRevisionId: saved?.baseRevisionId ?? autosave.baseRevisionId,
        scheduledAt,
        idempotencyKey: scheduleIdempotencyKeyRef.current ?? (scheduleIdempotencyKeyRef.current = newScheduleIdempotencyKey())
      });
      scheduleIdempotencyKeyRef.current = null;
      setScheduleDate(scheduleDateInput(new Date(Date.now() + 60 * 60 * 1000)));
      setSchedules((current) => current ? [next, ...current.filter((record) => record.id !== next.id)] : current);
      await refreshSchedules();
    } catch (schedulePublishError) {
      // Keep the idempotency key after an uncertain request so a retry cannot
      // create a second schedule for the same snapshot.
      setScheduleError(scheduleErrorMessage(schedulePublishError));
    } finally {
      setScheduleBusy("");
    }
  };

  const reschedulePublish = async (record: DesignScheduleRecord, value: string) => {
    const scheduledAt = scheduleDateIso(value);
    if (!scheduledAt || Date.parse(scheduledAt) <= Date.now()) {
      setScheduleError("Choose a future date and time for the rescheduled publish.");
      return;
    }
    setScheduleBusy(`${record.id}:reschedule`);
    setScheduleError("");
    try {
      const next = await scheduleApi.reschedule(template, record.id, scheduledAt);
      setSchedules((current) => current?.map((candidate) => candidate.id === next.id ? next : candidate) ?? current);
      await refreshSchedules();
    } catch (rescheduleError) {
      setScheduleError(scheduleErrorMessage(rescheduleError));
    } finally {
      setScheduleBusy("");
    }
  };

  const rebaseSchedule = async (record: DesignScheduleRecord) => {
    setScheduleBusy(`${record.id}:rebase`);
    setScheduleError("");
    try {
      const current = await apiFetch<AdminDesign>({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}`
      });
      if (!Number.isInteger(current.revision) || current.revision < 0) throw new Error("Invalid live revision");
      const next = await scheduleApi.rebase(template, record.id, current.revision);
      setSchedules((existing) => existing?.map((candidate) => candidate.id === next.id ? next : candidate) ?? existing);
      await refreshSchedules();
    } catch (rebaseError) {
      setScheduleError(scheduleErrorMessage(rebaseError));
    } finally {
      setScheduleBusy("");
    }
  };

  const cancelSchedule = async (record: DesignScheduleRecord) => {
    if (!window.confirm(`Cancel the ${scheduleDateLabel(record.scheduledAt)} design publish? The immutable snapshot will be retained as cancelled.`)) return;
    setScheduleBusy(`${record.id}:cancel`);
    setScheduleError("");
    try {
      const next = await scheduleApi.cancel(template, record.id);
      setSchedules((existing) => existing?.map((candidate) => candidate.id === next.id ? next : candidate) ?? existing);
      await refreshSchedules();
    } catch (cancelError) {
      setScheduleError(scheduleErrorMessage(cancelError));
    } finally {
      setScheduleBusy("");
    }
  };

  const resetToLive = async () => {
    if (!canEdit || !design || !hasDraft || isTransitioning) return;
    if (!window.confirm(
      "Discard this draft and start again from the design the live site is using? Your unpublished changes for this template will be deleted."
    )) return;

    setIsTransitioning(true);
    setError("");
    try {
      // Discard explicitly supersedes debounce work and waits for a request
      // already in flight before the DELETE can run.
      await autosave.discard();
      await apiFetch({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/autosave`,
        method: "DELETE"
      });
      const liveDocument = design.revision > 0
        ? design.document
        : getFallbackDesignDocument(template, publicationTheme);
      const nextLoaded = loadDesignIntoEditor(liveDocument ?? {}, template);
      const nextEditorState = nextLoaded.editorState;
      const nextDocument = editorStateToDesignDocument(nextEditorState, template, publicationTheme, nextLoaded.legacy);
      setDesign({ ...design, autosave: null });
      setLoaded(nextLoaded);
      setEditorState(nextEditorState);
      setEditorKey((key) => key + 1);
      latestDocumentRef.current = nextDocument;
      editorVersionRef.current += 1;
      setPublishPhase("idle");
      autosave.hydrate({ hasDraft: false, baseRevisionId: design.revision });
    } catch (resetError) {
      autosave.hydrate({ hasDraft: Boolean(design.autosave), baseRevisionId: design.autosave?.baseRevisionId ?? design.revision });
      setError(errorMessage(resetError));
    } finally {
      setIsTransitioning(false);
    }
  };

  const removeLegacyBlock = (index: number) => {
    if (!loaded?.legacy || !editorState) return;
    const block = loaded.legacy.unconvertedBlocks[index];
    if (!block) return;
    if (!window.confirm(
      `Remove ${legacyBlockLabel(block.type)} from this unpublished design? This deletes the preserved legacy block from the draft; the published revision and history remain unchanged.`
    )) return;
    const remaining = loaded.legacy.unconvertedBlocks.filter((_, blockIndex) => blockIndex !== index);
    const nextLegacy = remaining.length
      ? {
          ...loaded.legacy,
          unconvertedBlocks: remaining,
          ...(loaded.legacy.packageIndexes
            ? { packageIndexes: loaded.legacy.packageIndexes.filter((_, blockIndex) => blockIndex !== index) }
            : {})
        }
      : undefined;
    const nextLoaded: StudioLoadResult = {
      ...loaded,
      legacy: nextLegacy,
      unsupportedLegacyTypes: nextLegacy
        ? [...new Set(nextLegacy.unconvertedBlocks.map((preserved) => legacyBlockLabel(preserved.type)))]
        : []
    };
    const nextDocument = editorStateToDesignDocument(editorState, template, publicationTheme, nextLegacy);
    setLoaded(nextLoaded);
    latestDocumentRef.current = nextDocument;
    scheduleIdempotencyKeyRef.current = null;
    setError("");
    autosave.schedule(nextDocument);
  };

  const retryDeployment = async () => {
    if (!deployment?.canRetry || deploymentRetrying) return;
    const retryTemplate = template;
    setDeploymentRetrying(true);
    setError("");
    try {
      const next = await apiFetch<StudioDeploymentStatus>({
        path: "/byline/v1/admin/deployment/trigger",
        method: "POST"
      });
      if (template === retryTemplate) {
        setDeployment(next);
        setDeploymentRefreshToken((token) => token + 1);
      }
    } catch (deploymentError) {
      setError("Your design is published in Byline, but deployment could not be retried. Check Deployment settings and try again.");
      void deploymentError;
    } finally {
      setDeploymentRetrying(false);
    }
  };

  useEffect(() => {
    if (publishPhase !== "published" || !design || !design.revision) return undefined;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      try {
        const next = await apiFetch<StudioDeploymentStatus>({
          path: `/byline/v1/admin/design/${encodeURIComponent(template)}/deployment`
        });
        if (cancelled) return;
        setDeployment(next);
        attempts += 1;
        if (!isDeploymentLive(next, template, design.revision) && (next.pending || attempts < 12)) {
          timer = setTimeout(() => void check(), 5000);
        }
      } catch {
        // The WordPress publish remains authoritative. Leave the editor with
        // the safe "published, status not confirmed" context rather than
        // claiming the public site is live.
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [deploymentRefreshToken, design, publishPhase, template]);

  if (!design || !loaded || !editorState) {
    return (
      <div className="byline-studio-app byline-studio-app-loading">
        <div className="byline-studio-loading">{error ? <Notice status="error">{error}</Notice> : <Spinner />}</div>
      </div>
    );
  }

  return (
    <div
      className="byline-studio-app"
      data-byline-outline={outlineOpen ? "expanded" : "collapsed"}
      data-byline-inspector={inspectorOpen ? "expanded" : "collapsed"}
      data-byline-hidden-packages={showHiddenPackages ? "visible" : "hidden"}
    >
      <div className="byline-studio-toolbar">
        {backUrl ? <a className="byline-studio-back-link" href={backUrl} onClick={exitStudio}>← Byline</a> : null}
        <SelectControl
          label="Template"
          hideLabelFromVision
          value={template}
          options={[...TEMPLATE_OPTIONS]}
          onChange={(nextTemplate) => void changeTemplate(nextTemplate)}
          disabled={isTransitioning}
        />
        <span className="byline-studio-title">{templateLabel(template)}</span>
        <span className="byline-studio-state" aria-live="polite">
          <span className="byline-studio-save-state">{saveLabel}</span>
          <span className="byline-studio-state-live">{liveLabel}{publishedTime ? ` · Published ${publishedTime}` : ""}</span>
          {hasDraft ? <span className="byline-studio-state-draft is-active">Unpublished changes</span> : null}
        </span>
        {publicSiteUrl ? <Button variant="secondary" href={publicSiteUrl} target="_blank" rel="noreferrer">Preview</Button> : null}
        <details className="byline-studio-view-menu">
          <summary>View</summary>
          <div className="byline-studio-panel-toggles">
            <Button
              variant="secondary"
              isPressed={showHiddenPackages}
              aria-pressed={showHiddenPackages}
              onClick={() => setShowHiddenPackages((visible) => !visible)}
            >
              Inactive packages
            </Button>
            <Button
              variant="secondary"
              isPressed={outlineOpen}
              aria-pressed={outlineOpen}
              onClick={() => setOutlineOpen((open) => !open)}
            >
              Packages
            </Button>
            <Button
              variant="secondary"
              isPressed={inspectorOpen}
              aria-pressed={inspectorOpen}
              onClick={() => setInspectorOpen((open) => !open)}
            >
              Settings
            </Button>
            <Button variant="secondary" disabled={!canEdit || !hasDraft || isTransitioning} onClick={() => void resetToLive()}>
              Reset to live
            </Button>
          </div>
        </details>
      </div>
      <div className="byline-studio-notices">
        {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
        {publishPhase === "published" ? (
          <Notice status={deploymentFailed ? "error" : liveNow ? "success" : "warning"} isDismissible={false}>
            <strong>{deploymentLabel}</strong>
            {deploymentFailed ? <p>Your design is still published and safe in Byline. Retry deployment or check the Deployment settings.</p> : null}
            {publishPhase === "published" && publicSiteUrl ? <p><Button variant="secondary" href={publicSiteUrl} target="_blank" rel="noreferrer">View site</Button></p> : null}
            {deploymentFailed && deployment?.canRetry ? <Button variant="secondary" isBusy={deploymentRetrying} disabled={deploymentRetrying} onClick={() => void retryDeployment()}>Retry deployment</Button> : null}
          </Notice>
        ) : null}
        {hasDraft && neverPublished ? (
          <Notice status="warning" isDismissible={false}>
            <strong>You are editing an unpublished draft.</strong> This template has never been published, so the live
            site is still rendering its default design — not what the canvas shows. Keep editing to publish this draft,
            or reset it and start from the live design.
            <span className="byline-studio-notice-actions">
              <Button variant="secondary" disabled={!canEdit} onClick={resetToLive}>
                Reset draft to the live design
              </Button>
            </span>
          </Notice>
        ) : null}
        {loaded.migratedFromV1 ? (
          <Notice status="warning" isDismissible={false}>
            <strong>This design was created in the previous editor.</strong> It has been converted, and saving
            will store it in the new format.
            {loaded.migrationWarnings.length ? (
              <ul className="byline-migration-warnings">
                {loaded.migrationWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </Notice>
        ) : null}
        {loaded.recoveredLegacyBlocks ? (
          <Notice status="success" isDismissible={false}>
            <strong>{templateLabel(template)} design updated.</strong>{" "}
            {loaded.recoveredLegacyBlocks === 1 ? "1 block" : `${loaded.recoveredLegacyBlocks} blocks`} preserved by an
            older version of Byline {loaded.recoveredLegacyBlocks === 1 ? "was" : "were"} recovered into the current
            package format. Review the packages below; the next save stores them.
          </Notice>
        ) : null}
        {hasUnconvertedLegacy && loaded.legacy ? <LegacyResolution template={template} legacy={loaded.legacy} onRemove={removeLegacyBlock} /> : null}
      </div>
      <DesignOperationsPanel
        canPublish={canPublish}
        scheduleReady={canPublish && schedules !== null && !scheduleLoading && !scheduleError && !hasUnconvertedLegacy}
        scheduleBlocked={hasUnconvertedLegacy}
        scheduleLoading={scheduleLoading}
        scheduleError={scheduleError}
        schedules={schedules ?? []}
        scheduleDate={scheduleDate}
        scheduleBusy={scheduleBusy}
        intelligence={intelligence}
        semanticDiff={semanticDiff}
        onScheduleDateChange={setScheduleDate}
        onSchedule={() => void schedulePublish()}
        onRefresh={() => void refreshSchedules()}
        onReschedule={(record, value) => void reschedulePublish(record, value)}
        onRebase={(record) => void rebaseSchedule(record)}
        onCancel={(record) => void cancelSchedule(record)}
      />
      <div className="byline-studio-workspace">
        <Puck
          key={`${template}-${editorKey}`}
          config={studioConfig}
          data={editorState as unknown as Data}
          onChange={onEditorChange}
          onPublish={publish}
          permissions={{ drag: canEdit && !isTransitioning && publishPhase !== "publishing", duplicate: canEdit && !isTransitioning, delete: canEdit && !isTransitioning, edit: canEdit && !isTransitioning && publishPhase !== "publishing", insert: canEdit && !isTransitioning }}
          headerTitle={`Byline Studio · ${template}`}
          overrides={{ iframe: iframeOverride }}
          viewports={[...BYLINE_STUDIO_VIEWPORTS]}
          iframe={{ enabled: true, syncHostStyles: false }}
          height="100%"
        />
      </div>
    </div>
  );
}

type DesignRevision = { id: number; authorId: number; authorName?: string; modifiedAt: string };

export function BylineDesignRevisions({ canEdit, backUrl, studioUrl }: { canEdit: boolean; backUrl?: string; studioUrl?: string }) {
  const [template, setTemplate] = useState<StudioTemplate>(initialStudioTemplate);
  const [revisions, setRevisions] = useState<DesignRevision[] | null>(null);
  const [current, setCurrent] = useState<AdminDesign | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    setRevisions(null);
    setCurrent(null);
    setMessage("");
    setRestored(false);
    let cancelled = false;
    Promise.all([
      apiFetch<DesignRevision[]>({ path: `/byline/v1/admin/design/${encodeURIComponent(template)}/revisions` }),
      apiFetch<AdminDesign>({ path: `/byline/v1/admin/design/${encodeURIComponent(template)}` })
    ])
      .then(([nextRevisions, nextCurrent]) => {
        if (cancelled) return;
        setRevisions(nextRevisions);
        setCurrent(nextCurrent);
      })
      .catch((revisionError) => {
        if (!cancelled) setError(errorMessage(revisionError));
      });
    return () => { cancelled = true; };
  }, [template]);

  const restore = async (revision: DesignRevision) => {
    setError("");
    try {
      await apiFetch({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/restore/${revision.id}`,
        method: "POST"
      });
      setRestored(true);
      setMessage("The selected revision is now an unpublished Studio draft. The published revision is unchanged.");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    }
  };

  return (
    <div className="byline-revisions-screen">
      {backUrl ? <a className="byline-studio-back-link" href={backUrl}>← Back to Byline</a> : null}
      <SelectControl
        label="Template"
        value={template}
        options={[...TEMPLATE_OPTIONS]}
        onChange={setTemplate}
      />
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      {message ? (
        <Notice status="success" isDismissible={false}>
          {message}
          {restored && studioUrl ? (
            <p><Button variant="secondary" href={`${studioUrl}${studioUrl.includes("?") ? "&" : "?"}template=${encodeURIComponent(template)}`}>Open restored draft</Button></p>
          ) : null}
        </Notice>
      ) : null}
      {!revisions || !current ? <Spinner /> : (
        <>
          {current.revision > 0 ? (
            <section className="byline-current-revision" aria-label="Current published revision">
              <strong>Current — Revision {current.revision}</strong>
              <span>{current.modifiedAt ? new Date(current.modifiedAt).toLocaleString() : ""}{current.publishedAuthorName ? ` · ${current.publishedAuthorName}` : ""}</span>
            </section>
          ) : <p>No published design exists for this template yet.</p>}
          {revisions.length === 0 ? <p>No prior published revisions are available yet.</p> : (
        <ol className="byline-revision-list">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <div>
                <strong>Revision {revision.id}</strong>
                <span>{new Date(revision.modifiedAt).toLocaleString()}{revision.authorName ? ` · ${revision.authorName}` : ""}</span>
              </div>
              <div className="byline-revision-actions">
                <Button variant="secondary" disabled={!canEdit} onClick={() => restore(revision)}>Restore as draft</Button>
              </div>
            </li>
          ))}
        </ol>
          )}
        </>
      )}
    </div>
  );
}
