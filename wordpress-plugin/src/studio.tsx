import apiFetch from "@wordpress/api-fetch";
import { Button, Notice, SelectControl, Spinner } from "@wordpress/components";
import { useEffect, useMemo, useRef, useState } from "@wordpress/element";
import { Puck, type Config, type Data } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import {
  AuthorPickerField,
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

type DesignDocument = {
  schemaVersion: 1;
  template: string;
  theme: string;
  editor: { engine: "puck"; version: string };
  layout: Data;
};

type AdminDesign = {
  document: DesignDocument;
  revision: number;
  modifiedAt: string | null;
  autosave: {
    document: DesignDocument;
    baseRevisionId: number;
    modifiedAt: string;
  } | null;
};

type StudioProps = {
  canEdit: boolean;
  canPublish: boolean;
  publicationTheme: string;
  tokenOverrides: Record<string, string>;
};

export const studioBlockGroups = {
  Stories: [
    "story-lead", "story-grid", "story-list", "latest-stories", "featured-story", "section-feed",
    "opinion-package", "photo-feature", "special-coverage"
  ],
  Sports: ["sports-scores", "sports-upcoming", "team-feature", "athlete-feature"],
  Community: ["events-list", "poll", "newsletter"],
  Layout: ["section", "columns", "divider"]
} as const;
const blockGroups = studioBlockGroups;

const labels: Record<string, string> = {
  "story-lead": "Lead story",
  "story-grid": "Story grid",
  "story-list": "Story list",
  "latest-stories": "Latest stories",
  "featured-story": "Featured story",
  "section-feed": "Section feed",
  "opinion-package": "Opinion package",
  "photo-feature": "Photo feature",
  "special-coverage": "Special coverage",
  "sports-scores": "Recent scores",
  "sports-upcoming": "Upcoming games",
  "team-feature": "Team feature",
  "athlete-feature": "Athlete feature",
  "events-list": "Events list",
  poll: "Poll",
  newsletter: "Newsletter",
  section: "Section",
  columns: "Columns",
  divider: "Divider"
};

const storyBlockIds = new Set([
  "story-lead", "story-grid", "story-list", "latest-stories", "featured-story", "section-feed",
  "opinion-package", "photo-feature", "special-coverage", "team-feature", "athlete-feature"
]);
const sportsBlockIds = new Set(["sports-scores", "sports-upcoming", "team-feature", "athlete-feature"]);

const components = Object.fromEntries(
  Object.values(blockGroups).flat().map((type) => {
    const fields: Record<string, unknown> = { title: { type: "text", label: "Heading" } };
    const defaultProps: Record<string, unknown> = { title: labels[type] };
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
    label: labels[type], fields, defaultProps,
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
            <small style={{ color: "var(--muted, #635f59)", textTransform: "uppercase" }}>{labels[type]}</small>
            <h2 style={{ margin: "8px 0 4px" }}>{title || labels[type]}</h2>
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

const previewThemes: Record<string, Record<string, string>> = {
  "weekly-wildcat": { page: "#fbfaf7", paper: "#ffffff", ink: "#151515", muted: "#635f59", rule: "#d8d0c7", ruleStrong: "#171717", accent: "#b11f24", fontBody: '"aktiv-grotesk", Arial, sans-serif', radius: "0px" },
  "byline-modern": { page: "#f7f9fa", paper: "#ffffff", ink: "#14212b", muted: "#5f6d76", rule: "#d9e0e3", ruleStrong: "#14212b", accent: "#008b95", fontBody: "Arial, sans-serif", radius: "4px" },
  "byline-editorial": { page: "#f8f5ef", paper: "#fffdf8", ink: "#191714", muted: "#645f57", rule: "#cec5b7", ruleStrong: "#191714", accent: "#9a2725", fontBody: "Georgia, serif", radius: "0px" },
  "byline-magazine": { page: "#f4f1ec", paper: "#ffffff", ink: "#171717", muted: "#68625c", rule: "#ddd5cc", ruleStrong: "#171717", accent: "#d94b32", fontBody: "Arial, sans-serif", radius: "3px" }
};

export function createStudioConfig(theme: string, overrides: Record<string, string>): Config {
  const tokens = { ...(previewThemes[theme] ?? previewThemes["weekly-wildcat"]), ...overrides };
  const variables = {
    "--page": tokens.background || tokens.page,
    "--paper": tokens.surface || tokens.paper,
    "--ink": tokens.text || tokens.ink,
    "--muted": tokens.mutedText || tokens.muted,
    "--rule": tokens.border || tokens.rule,
    "--rule-strong": tokens.borderStrong || tokens.ruleStrong,
    "--accent": tokens.accent,
    "--font-body": tokens.fontBody,
    "--radius-small": tokens.radiusSmall || tokens.radius
  } as CSSProperties;

  return {
    ...studioConfigBase,
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

export function BylineStudio({ canEdit, canPublish, publicationTheme, tokenOverrides }: StudioProps) {
  const [template, setTemplate] = useState<"home" | "section-default" | "article-default" | "author-default" | "sports-home">("home");
  const [design, setDesign] = useState<AdminDesign | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const studioConfig = useMemo(
    () => createStudioConfig(publicationTheme, tokenOverrides),
    [publicationTheme, tokenOverrides]
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

  const workingDocument = design.autosave?.document ?? design.document;
  const baseRevisionId = design.autosave?.baseRevisionId ?? design.revision;

  const documentFor = (data: Data): DesignDocument => ({
    schemaVersion: 1,
    template,
    theme: publicationTheme,
    editor: { engine: "puck", version: "0.23.0" },
    layout: data
  });

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
    <div className="byline-studio-shell">
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
      </div>
      {error ? <Notice status="error" isDismissible={false}>{error}</Notice> : null}
      <Puck
        key={`${template}-${design.revision}-${design.autosave?.modifiedAt || "published"}`}
        config={studioConfig}
        data={workingDocument.layout}
        onChange={autosave}
        onPublish={publish}
        permissions={{ drag: canEdit, duplicate: canEdit, delete: canEdit, edit: canEdit, insert: canEdit }}
        headerTitle={`Byline Studio · ${template}`}
        viewports={[
          { label: "Mobile", width: 360 },
          { label: "Tablet", width: 768 },
          { label: "Desktop", width: 1280 },
          { label: "Responsive", width: "100%" }
        ]}
        iframe={{ enabled: true, syncHostStyles: false }}
        height="calc(100vh - 230px)"
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
