import apiFetch from "@wordpress/api-fetch";
import { useEffect, useState } from "@wordpress/element";
import {
  PollCard,
  ThisWeekCard,
  packageHeadingId,
  getBriefPackageRenderer,
  getLeadPackageRenderer,
  getInFocusPackageRenderer,
  getMorePackageRenderer,
  getNewsletterPackageRenderer,
  getOpinionPackageRenderer,
  getSpecialCoveragePackageRenderer,
  getSportsPackageRenderer,
  isResolvedHomepagePackageVisible,
  type CalendarEntryView,
  type ResolvedHomepagePackage
} from "@byline/ui";
import type { ReactElement } from "react";
import {
  setPreviewDataLoader,
  snapshotFor,
  subscribe,
  toPreviewCoverageInputs,
  toPreviewData,
  type PreviewGame,
  type PreviewPost,
  type PreviewSnapshot
} from "./studio-preview-model";

export {
  loadPreviewData,
  previewPackageId,
  setStudioPreviewDocument,
  setStudioPreviewLiveDocument,
  setStudioPreviewCoverages,
  setStudioPreviewOptions,
  studioPreviewDiff,
  studioPreviewIntelligence,
  __setPreviewDataForTests,
  type StudioPreviewPublication,
  type PreviewSnapshot
} from "./studio-preview-model";
export {
  createDesignScheduleApi,
  createWordPressDesignScheduleApi,
  designSchedulePath,
  DesignScheduleApiError,
  type DesignScheduleApi,
  type DesignScheduleRequest,
  type DesignScheduleTransport
} from "./design-scheduling-api";
import { previewPackageId } from "./studio-preview-model";

// Studio's preview transport. Fetching lives here; resolution lives in the
// model module, which both hosts' parity coverage can import without a
// WordPress client.
setPreviewDataLoader(() =>
  Promise.all([
    apiFetch<PreviewPost[]>({ path: "/wp/v2/posts?per_page=20&_embed=1&status=publish" }).catch(() => []),
    apiFetch<Array<Record<string, unknown>>>({ path: "/weekly-wildcat/v1/school-events?per_page=12" }).catch(() => []),
    apiFetch<PreviewGame[]>({ path: "/weekly-wildcat/v1/sports-games/recent?per_page=8" }).catch(() => []),
    apiFetch<PreviewGame[]>({ path: "/weekly-wildcat/v1/sports-games/upcoming?per_page=12" }).catch(() => []),
    apiFetch<unknown>({ path: "/byline/v1/coverage?public=1&per_page=100" }).catch(() => [])
  ]).then(([posts, events, recentScores, upcomingGames, coverages]) =>
    toPreviewData({ posts, events, recentScores, upcomingGames, coverages: toPreviewCoverageInputs(coverages) })
  )
);

// Studio's package preview components.
//
// Each one looks its own resolved model up in the shared document-level
// resolution (see studio-preview-model.ts) and hands it to exactly the renderer
// the published site uses. There is no per-package selection here, and no
// Studio-only presentation branch.

function useResolvedPackage(packageId: string): PreviewSnapshot {
  const [snapshot, setSnapshot] = useState<PreviewSnapshot>(() => snapshotFor(packageId));

  useEffect(() => {
    setSnapshot(snapshotFor(packageId));

    return subscribe(() => setSnapshot(snapshotFor(packageId)));
  }, [packageId]);

  return snapshot;
}

// --- shared preview shell ---------------------------------------------------

export type StudioPreviewContext = {
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean; newsletter?: boolean };
  publicationShortName: string;
  calendarHeading: string;
};

export type PackagePreviewProps = StudioPreviewContext & {
  props: unknown;
};

/**
 * The editor-only marker for a package that resolves to nothing.
 *
 * A configured package is a homepage *position*, not a promise that a section
 * exists: production renders nothing for an empty Special Coverage, so the
 * public preview renders nothing either. This is deliberately not public
 * content -- it carries no publication styling, is excluded from the published
 * output entirely, and can be switched off from the toolbar to measure the
 * canvas exactly as a reader would see it.
 */
function HiddenPackageNotice({ label, reason }: { label: string; reason: string }) {
  // Styled inline rather than through the publication stylesheet: this marker
  // lives inside the preview iframe and must be impossible to mistake for a
  // theme surface, and it must not depend on CSS the published site ships.
  return (
    <div
      className="byline-preview-hidden-package"
      data-byline-editor-only="true"
      style={{
        alignItems: "baseline",
        border: "1px dashed #8c8f94",
        borderRadius: 2,
        color: "#50575e",
        display: "flex",
        flexWrap: "wrap",
        font: "500 12px/1.4 -apple-system, system-ui, sans-serif",
        gap: 8,
        padding: "8px 10px"
      }}
    >
      <strong>{label}</strong>
      <span>Not currently visible · {reason}</span>
    </div>
  );
}

function PackagePreviewLoading() {
  return <p className="byline-preview-loading">Loading publication content…</p>;
}

const EMPTY_REASONS: Record<string, string> = {
  "lead-package": "No stories or modules match this package",
  "brief-package": "No stories currently match this package",
  "in-focus-package": "No stories currently match this package",
  "special-coverage-package": "No stories currently match this package",
  "opinion-package": "No stories currently match this package",
  "sports-package": "No stories, scores or fixtures match this package",
  "more-package": "No stories currently match this package",
  "newsletter-package": "The newsletter module is disabled for this publication"
};

/**
 * One preview surface for every semantic package.
 *
 * It looks its own resolved model up in the shared document-level resolution,
 * then hands it to exactly the renderer the published site uses. There is no
 * per-package selection here, and no Studio-only presentation branch.
 */
function PackagePreview({
  packageId,
  label,
  children
}: {
  packageId: string;
  label: string;
  children: (entry: ResolvedHomepagePackage, events: CalendarEntryView[]) => ReactElement | null;
}) {
  const snapshot = useResolvedPackage(packageId);

  if (!snapshot.ready) return <PackagePreviewLoading />;
  if (!snapshot.entry) return <PackagePreviewLoading />;

  if (!isResolvedHomepagePackageVisible(snapshot.entry)) {
    // Production renders nothing here, so the public preview renders nothing
    // either. The marker is editor chrome and can be switched off entirely to
    // measure the canvas exactly as a reader would see it.
    if (!snapshot.showHiddenPackages) return null;

    return <HiddenPackageNotice label={label} reason={EMPTY_REASONS[snapshot.entry.type] ?? "No matching content"} />;
  }

  return children(snapshot.entry, snapshot.events);
}

export function LeadPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  const packageId = previewPackageId(props, "home-lead");

  return (
    <PackagePreview
      packageId={packageId}
      label="Lead package"
    >
      {(entry, events) => {
        if (entry.type !== "lead-package") return null;

        const Renderer = getLeadPackageRenderer(theme);

        return (
          <Renderer
            package={entry.package}
            pollSlot={
              <PollCard headingId={packageHeadingId(`${packageId}-poll`, "homepage-poll-heading")}>
                <p className="homepage-poll-note">Live poll results appear on the published site.</p>
              </PollCard>
            }
            calendarSlot={
              <ThisWeekCard
                entries={events.slice(0, entry.package.utility.calendarLimit || undefined)}
                heading={entry.package.utility.calendarHeading ?? context.calendarHeading}
                scheduleHref="/sports/schedule/"
                headingId={packageHeadingId(`${packageId}-calendar`, "this-week-heading")}
              />
            }
          />
        );
      }}
    </PackagePreview>
  );
}

export function BriefPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview packageId={previewPackageId(props, "home-brief")} label="Brief package">
      {(entry) => {
        if (entry.type !== "brief-package") return null;

        const Renderer = getBriefPackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function InFocusPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview packageId={previewPackageId(props, "home-in-focus")} label="In Focus package">
      {(entry) => {
        if (entry.type !== "in-focus-package") return null;

        const Renderer = getInFocusPackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function SpecialCoveragePackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview
      packageId={previewPackageId(props, "home-special-coverage")}
      label="Special Coverage package"
    >
      {(entry) => {
        if (entry.type !== "special-coverage-package") return null;

        const Renderer = getSpecialCoveragePackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function OpinionPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview packageId={previewPackageId(props, "home-opinion")} label="Opinion package">
      {(entry) => {
        if (entry.type !== "opinion-package") return null;

        const Renderer = getOpinionPackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function SportsPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview packageId={previewPackageId(props, "home-sports")} label="Sports package">
      {(entry) => {
        if (entry.type !== "sports-package") return null;

        const Renderer = getSportsPackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function MorePackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview packageId={previewPackageId(props, "home-more")} label="More package">
      {(entry) => {
        if (entry.type !== "more-package") return null;

        const Renderer = getMorePackageRenderer(theme);

        return <Renderer package={entry.package} />;
      }}
    </PackagePreview>
  );
}

export function NewsletterPackagePreview({ props, theme, ...context }: PackagePreviewProps) {
  return (
    <PackagePreview
      packageId={previewPackageId(props, "home-newsletter")}
      label="Newsletter package"
    >
      {(entry) => {
        if (entry.type !== "newsletter-package") return null;

        const Renderer = getNewsletterPackageRenderer(theme);

        // Intentionally a non-submitting preview surface. The published
        // renderer receives the real signup form from the host; Studio never
        // embeds a production endpoint or a client submission flow.
        return (
          <Renderer
            package={entry.package}
            formSlot={
              <div className="byline-preview-newsletter-surface">
                {entry.package.presentation.showLabel ? <p>{entry.package.label}</p> : null}
                <h3>{entry.package.heading}</h3>
                <span>{context.publicationShortName} newsletter signup preview</span>
              </div>
            }
          />
        );
      }}
    </PackagePreview>
  );
}
