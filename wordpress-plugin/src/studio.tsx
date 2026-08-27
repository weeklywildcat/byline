import apiFetch from "@wordpress/api-fetch";
import { Button, Notice, SelectControl, Spinner } from "@wordpress/components";
import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { Puck, type Config, type Data } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { BYLINE_STUDIO_CATEGORIES, BYLINE_STUDIO_VIEWPORTS } from "@byline/studio-contract";
import { sanitizeThemeTokenOverrides, type BylineThemeDefinition, type BylineThemeTokens } from "@byline/theme-contract";
import { editorialTheme } from "@byline/theme-editorial";
import { magazineTheme } from "@byline/theme-magazine";
import { modernTheme } from "@byline/theme-modern";
import { weeklyWildcatTheme } from "@byline/theme-weekly-wildcat";
import { getBylineBlockPresentation, themeTokensToCssVariables } from "@byline/ui";
import { LeadPackagePreview, SportsPackagePreview } from "./studio-preview";
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
  LEAD_PACKAGE_TYPE,
  SPORTS_PACKAGE_TYPE,
  WEEKLY_WILDCAT_LEAD_DEFAULTS,
  WEEKLY_WILDCAT_SPORTS_DEFAULTS,
  type BylineDesignDocumentV2
} from "@byline/design";
import { editorStateToDesignDocument, loadDesignIntoEditor, type PuckEditorState } from "./studio-document";

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
};

type StudioProps = {
  canEdit: boolean;
  canPublish: boolean;
  publicationTheme: string;
  tokenOverrides: Record<string, string>;
  features?: { polls: boolean; events: boolean; sports: boolean };
  publicationShortName?: string;
  calendarHeading?: string;
};

// Everything the preview needs that is publication-specific rather than
// design-specific. Passed in so no Weekly Wildcat identity is baked into Studio.
export type StudioPreviewContext = {
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean };
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
          },
          opinionTreatment: {
            type: "radio" as const,
            label: "Opinion treatment",
            options: [
              { label: "Follow the story's setting", value: "auto" },
              { label: "Never", value: "off" }
            ]
          }
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_LEAD_DEFAULTS },
    // The acceptance criterion for this phase: Studio renders the same shared
    // renderer as the static site, against real WordPress content.
    render: (props: Record<string, unknown>) => (
      <LeadPackagePreview
        props={props}
        theme={context.theme}
        features={context.features}
        publicationShortName={context.publicationShortName}
        calendarHeading={context.calendarHeading}
      />
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
          showBylines: showHide("Show bylines")
        }
      }
    },
    defaultProps: { ...WEEKLY_WILDCAT_SPORTS_DEFAULTS },
    render: (props: Record<string, unknown>) => (
      <SportsPackagePreview
        props={props}
        theme={context.theme}
        features={context.features}
        publicationShortName={context.publicationShortName}
      />
    )
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

export function createStudioConfig(
  theme: string,
  overrides: Record<string, string>,
  context?: StudioPreviewContext
): Config {
  const variables = getStudioThemeVariables(theme, overrides) as CSSProperties;
  const previewContext: StudioPreviewContext = context ?? {
    theme,
    features: { polls: true, events: true, sports: true },
    publicationShortName: "Newsroom",
    calendarHeading: "This week"
  };

  return {
    ...studioConfigBase,
    categories: {
      Packages: {
        title: "Packages",
        components: [LEAD_PACKAGE_TYPE, SPORTS_PACKAGE_TYPE],
        defaultExpanded: true
      },
      ...studioConfigBase.categories
    } as Config["categories"],
    components: {
      ...studioConfigBase.components,
      [LEAD_PACKAGE_TYPE]: createLeadPackageComponent(previewContext),
      [SPORTS_PACKAGE_TYPE]: createSportsPackageComponent(previewContext)
    } as unknown as Config["components"],
    root: {
      render: ({ children }: { children: ReactNode }) => (
      <div style={{
        ...variables,
        background: "var(--page)",
        display: "grid",
        gap: 20,
        margin: "0 auto",
        maxWidth: "var(--max-width, 1180px)",
        minHeight: "100vh",
        padding: 24
      }}>
        {children}
      </div>
      )
    }
  } as Config;
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "byline_design_conflict") {
    return "Another editor published this design. Reload it before reapplying your work.";
  }
  return "Byline Studio could not save this design. Review the block settings and try again.";
}

export function BylineStudio({
  canEdit,
  canPublish,
  publicationTheme,
  tokenOverrides,
  features = { polls: true, events: true, sports: true },
  publicationShortName = "Newsroom",
  calendarHeading = "This week"
}: StudioProps) {
  const [template, setTemplate] = useState<"home" | "section-default" | "article-default" | "author-default" | "sports-home">("home");
  const [design, setDesign] = useState<AdminDesign | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  // Both panels collapse so the preview can take the full width. Defaults keep
  // them open: an editor should see the package list on first open.
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studioConfig = useMemo(
    () =>
      createStudioConfig(publicationTheme, tokenOverrides, {
        theme: publicationTheme,
        features,
        publicationShortName,
        calendarHeading
      }),
    [calendarHeading, features, publicationShortName, publicationTheme, tokenOverrides]
  );

  const load = () => {
    setDesign(null);
    setError("");
    apiFetch<AdminDesign>({ path: `/byline/v1/admin/design/${encodeURIComponent(template)}` })
      .then(setDesign)
      .catch((loadError) => setError(errorMessage(loadError)));
  };

  useEffect(() => {
    load();
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [template]);

  if (!design) {
    return <div className="byline-studio-loading">{error ? <Notice status="error">{error}</Notice> : <Spinner />}</div>;
  }

  const stored = design.autosave?.document ?? design.document;
  const baseRevisionId = design.autosave?.baseRevisionId ?? design.revision;
  const loaded = loadDesignIntoEditor(stored, template);

  // Editor state is converted to the semantic document before it leaves the
  // browser. No Puck structure is persisted.
  //
  // `loaded.legacy` is threaded through on every write. It holds migrated blocks
  // that have no v2 package yet, kept outside Puck so they cannot be edited --
  // but they must be merged back, or the first edit to a migrated design would
  // permanently destroy the sections the migration preserved.
  const documentFor = (data: Data): DesignDocument =>
    editorStateToDesignDocument(data as unknown as PuckEditorState, template, publicationTheme, loaded.legacy);

  const autosave = (data: Data) => {
    if (!canEdit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      apiFetch({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/autosave`,
        method: "PUT",
        data: { document: documentFor(data), baseRevisionId }
      })
        .then(() => setStatus("Draft autosaved"))
        .catch((autosaveError) => setError(errorMessage(autosaveError)));
    }, 900);
  };

  const publish = async (data: Data) => {
    if (!canPublish) return;
    setError("");
    try {
      const published = await apiFetch<AdminDesign>({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/publish`,
        method: "POST",
        data: { document: documentFor(data), baseRevisionId }
      });
      setDesign(published);
      setStatus(`Published revision ${published.revision}`);
    } catch (publishError) {
      setError(errorMessage(publishError));
    }
  };

  return (
    <div
      className="byline-studio-shell byline-studio-wide"
      data-byline-outline={outlineOpen ? "expanded" : "collapsed"}
      data-byline-inspector={inspectorOpen ? "expanded" : "collapsed"}
    >
      <div className="byline-studio-toolbar">
        <SelectControl
          label="Template"
          value={template}
          options={[
            { label: "Homepage", value: "home" },
            { label: "Default section", value: "section-default" },
            { label: "Default article", value: "article-default" },
            { label: "Default author", value: "author-default" },
            { label: "Sports homepage", value: "sports-home" }
          ]}
          onChange={setTemplate}
        />
        <span>Published revision {design.revision}{status ? ` · ${status}` : ""}</span>
        {design.autosave ? <strong>Recovered autosave</strong> : null}
        <div className="byline-studio-panel-toggles">
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
        </div>
      </div>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
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
      <Puck
        key={`${template}-${design.revision}-${design.autosave?.modifiedAt || "published"}`}
        config={studioConfig}
        data={loaded.editorState as unknown as Data}
        onChange={autosave}
        onPublish={publish}
        permissions={{ drag: canEdit, duplicate: canEdit, delete: canEdit, edit: canEdit, insert: canEdit }}
        headerTitle={`Byline Studio · ${template}`}
        viewports={[...BYLINE_STUDIO_VIEWPORTS]}
        iframe={{ enabled: true, syncHostStyles: false }}
        height="calc(100vh - 200px)"
      />
    </div>
  );
}

type DesignRevision = { id: number; authorId: number; modifiedAt: string };

export function BylineDesignRevisions({ canEdit }: { canEdit: boolean }) {
  const [template, setTemplate] = useState<"home" | "section-default" | "article-default" | "author-default" | "sports-home">("home");
  const [revisions, setRevisions] = useState<DesignRevision[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setRevisions(null);
    setMessage("");
    apiFetch<DesignRevision[]>({ path: `/byline/v1/admin/design/${encodeURIComponent(template)}/revisions` })
      .then(setRevisions)
      .catch((revisionError) => setError(errorMessage(revisionError)));
  }, [template]);

  const restore = async (revision: DesignRevision) => {
    setError("");
    try {
      await apiFetch({
        path: `/byline/v1/admin/design/${encodeURIComponent(template)}/restore/${revision.id}`,
        method: "POST"
      });
      setMessage("The selected revision is now an unpublished Studio draft. Open Studio to review and publish it.");
    } catch (restoreError) {
      setError(errorMessage(restoreError));
    }
  };

  return (
    <div className="byline-revisions-screen">
      <SelectControl
        label="Template"
        value={template}
        options={[
          { label: "Homepage", value: "home" },
          { label: "Default section", value: "section-default" },
          { label: "Default article", value: "article-default" },
          { label: "Default author", value: "author-default" },
          { label: "Sports homepage", value: "sports-home" }
        ]}
        onChange={setTemplate}
      />
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      {message ? <Notice status="success" isDismissible={false}>{message}</Notice> : null}
      {!revisions ? <Spinner /> : revisions.length === 0 ? <p>No prior published revisions are available yet.</p> : (
        <ol className="byline-revision-list">
          {revisions.map((revision) => (
            <li key={revision.id}>
              <div>
                <strong>Revision {revision.id}</strong>
                <span>{new Date(revision.modifiedAt).toLocaleString()}</span>
              </div>
              <Button variant="secondary" disabled={!canEdit} onClick={() => restore(revision)}>Restore as draft</Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
