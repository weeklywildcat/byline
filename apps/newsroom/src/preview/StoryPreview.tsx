"use client";

import { buildArticlePresentation, type ArticlePresentation, type PublicSeriesInput } from "@byline/content/story";
import { useLivePreview } from "@payloadcms/live-preview-react";
import { ArticleShareActionsView, NewsletterSignupView, ReaderFeedbackView, type ArticleViewSlots } from "@byline/ui";
import { StoryArticle, renderRepositoryInteractive, repositoryInteractiveRegistry, resolveStoryPresentation, storyPresentationRegistry, type RepositoryInteractiveClient, type RepositoryInteractiveRegistry } from "@byline/story-presentations";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { STORY_LIVE_PREVIEW_DEPTH } from "./config";
import { payloadPresentationContext, payloadPublicStory, payloadStorySummary, type PayloadImage } from "./payload-story";
import { POPULATION_FAILED, createStoryPopulation, type PopulationFailure, type PopulationStatus } from "./population";
import type { PreviewPublication } from "./publication";
import { useStoryAssets } from "./story-assets";
import type { StoryPreviewContext } from "./context";

/**
 * The page inside Payload's Live Preview frame (and its pop-out window).
 *
 * Payload owns everything around it: the pane, iframe, toolbar, devices, zoom,
 * popup and the postMessage transport. This component only (1) subscribes with
 * the official `useLivePreview`, (2) turns the populated unsaved Story into the
 * canonical model and the shared `StoryArticle`, and (3) decides what to show
 * while the connection or a population request is not healthy.
 *
 * The hook's inputs are referentially stable on purpose: `useLivePreview`
 * resubscribes and resets its merge state when `initialData` or
 * `requestHandler` change identity.
 */

type StoryDoc = Record<string, unknown>;

/** Stable (module-level): a fresh `{}` per render would resubscribe and reset the hook. */
const NO_INITIAL_DATA: StoryDoc = Object.freeze({}) as StoryDoc;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const relationId = (value: unknown): string => String(isRecord(value) ? (value.id ?? "") : (value ?? ""));

function isStoryDoc(value: unknown): value is StoryDoc {
  return isRecord(value) && value.id !== undefined && value.id !== null && !(POPULATION_FAILED in value);
}

/* ------------------------------------------------------------------ context */

const CONTEXT_DEBOUNCE_MS = 500;

/**
 * The presentation context (corrections, related and More by candidates,
 * series). Refreshed when the Story's section, topics or contributors change,
 * not as the headline or body are typed. The previous context stays in place
 * while a refresh is in flight or fails.
 */
function useStoryContext(doc: StoryDoc | null): StoryPreviewContext | null {
  const [context, setContext] = useState<StoryPreviewContext | null>(null);
  const storyId = doc ? Number(doc.id) : null;
  const section = doc ? relationId(doc.section) : "";
  const topics = doc && Array.isArray(doc.topics) ? doc.topics.map(relationId).join(",") : "";
  const contributors = doc && Array.isArray(doc.contributors) ? doc.contributors.map(relationId).join(",") : "";

  useEffect(() => {
    if (!storyId || !Number.isSafeInteger(storyId)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams();
      if (section) params.set("section", section);
      if (topics) params.set("topics", topics);
      if (contributors) params.set("contributors", contributors);
      try {
        const response = await fetch(`/api/byline/stories/${storyId}/preview-context?${params}`, { credentials: "include", signal: controller.signal, headers: { Accept: "application/json" } });
        if (response.ok) setContext((await response.json()) as StoryPreviewContext);
      } catch {
        // Keep the previous context: related stories and series are not worth a broken preview.
      }
    }, CONTEXT_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [storyId, section, topics, contributors]);

  return storyId && context ? context : null;
}

/* ------------------------------------------------------------ presentation */

type Built = { ok: true; presentation: ArticlePresentation } | { ok: false; error: string };

function build(doc: StoryDoc, context: StoryPreviewContext | null, publication: PreviewPublication, interactives: RepositoryInteractiveRegistry): Built {
  try {
    const { story } = payloadPublicStory(doc, { publication, corrections: context?.corrections, interactiveKeys: Object.keys(interactives) });
    const self = { ...payloadStorySummary(doc, publication), listed: true };
    const series: PublicSeriesInput<PayloadImage>[] = (context?.series ?? []).map((entry) => ({
      id: entry.id,
      title: entry.title,
      href: entry.href,
      ...(entry.description ? { description: entry.description } : {}),
      format: entry.format,
      complete: entry.complete,
      stories: entry.members.map((member) => member ?? self)
    }));
    const presentation = buildArticlePresentation(story, payloadPresentationContext(publication, {
      relatedCandidates: context?.relatedCandidates ?? [],
      contributorStories: context?.contributorStories ?? [],
      series
    }));
    return { ok: true, presentation };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "The story could not be rendered." };
  }
}

/** The inert equivalents of the public site's interactive slots: same look, nothing is sent anywhere. */
function inertSlots(publication: PreviewPublication, interactives: RepositoryInteractiveRegistry): ArticleViewSlots {
  return {
    // Dates read in the publication's own locale and timezone; a repository interactive draws its static fallback.
    bodyHost: {
      formatDate: (iso) => new Intl.DateTimeFormat(publication.locale, { dateStyle: "medium", timeZone: publication.timeZone }).format(new Date(iso)),
      renderInteractive: renderRepositoryInteractive(interactives)
    },
    shareActions: <ArticleShareActionsView copyLabel="Copy link" copyIcon="ph:link" status="" />,
    poll: null,
    feedback: <ReaderFeedbackView inert type="correction" message="" name="" email="" submitting={false} status={null} />,
    newsletter: (
      <NewsletterSignupView
        heading={`Get ${publication.shortName} in your inbox`}
        preferredSource={{ href: publication.publicSite, label: `Add ${publication.shortName} as a preferred source on Google` }}
      />
    ),
    primaryGame: null
  };
}

/**
 * An ordinary article link must not navigate this frame away from the preview.
 * In-page (hash) links work; public and external links open separately.
 */
function useKeepPreviewInPlace(publicSite: string) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const raw = anchor.getAttribute("href") ?? "";
      if (raw.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(raw, window.location.href);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      event.preventDefault();
      // A site-relative link points at the public site, not at the newsroom.
      const target = url.origin === window.location.origin ? `${publicSite}${url.pathname}${url.search}${url.hash}` : url.href;
      window.open(target, "_blank", "noopener,noreferrer");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [publicSite]);
}

/**
 * Runs the article's own progressive enhancements as the public route does:
 * for an imported (HTML) body and for a structured one, so Before / After
 * gets its divider, Annotated Image its paired notes and Chart / Map its
 * clearly labelled preview. Repository interactives then load their own
 * browser enhancement. Re-run whenever the body changes.
 */
const loadInteractiveClient = (name: string) => import(`../../../../packages/story-presentations/src/interactives/${name}/client.ts`) as Promise<{ default: RepositoryInteractiveClient }>;

function useArticleEnhancements(presentation: ArticlePresentation | null, interactives: RepositoryInteractiveRegistry) {
  const body = presentation?.body ?? null;
  const html = body?.format === "legacy-html" ? body.html : body;
  useEffect(() => {
    if (html === null) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void (async () => {
      const [{ articleEnhancementSelector }, { enhanceArticleStory }] = await Promise.all([import("@byline/ui/article-enhancement-selector"), import("@byline/ui/article-enhancements")]);
      const root = document.querySelector<HTMLElement>(".article-body");
      if (disposed || !root) return;
      const stops: Array<() => void> = [];
      if (root.querySelector(articleEnhancementSelector)) stops.push(enhanceArticleStory(root, { preview: true }));
      // A registered interactive's browser enhancement, only when a story that places it is shown.
      for (const element of root.querySelectorAll<HTMLElement>("[data-repository-interactive]")) {
        const key = element.dataset.repositoryInteractive ?? "";
        const entry = interactives[key];
        const mount = element.querySelector<HTMLElement>("[data-interactive-root]");
        if (!entry?.client || !mount) continue;
        void loadInteractiveClient(key).then((module) => {
          if (disposed) return;
          const stop = module.default(mount);
          if (typeof stop === "function") stops.push(stop);
        }).catch(() => undefined);
      }
      cleanup = () => stops.forEach((stop) => stop());
    })();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [html, interactives]);
}

/* ------------------------------------------------------------------- states */

function Message({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <main className="byline-preview-message" role="status">
      <h1>{title}</h1>
      {children ? <p>{children}</p> : null}
      {action}
    </main>
  );
}

const reload = () => window.location.reload();
const ReloadButton = ({ label }: { label: string }) => <button type="button" onClick={reload}>{label}</button>;

function failureMessage(reason: PopulationFailure, detail: string): { title: string; body: string; action: string | null } {
  switch (reason) {
    case "signed-out":
      return { title: "Preview unavailable", body: "Your session may have expired. Sign in again, then reload.", action: "Reload" };
    case "forbidden":
      return { title: "Can't preview this story", body: "You don't have access to it.", action: null };
    case "not-found":
      return { title: "Can't preview this story", body: "It could not be found. It may have been deleted.", action: null };
    case "unsaved":
      return { title: "Preview starts after the first save", body: "Preview shows the story as you type, once it has been saved.", action: null };
    case "network":
      return { title: "Preview couldn't render", body: "The newsroom didn't respond.", action: "Try again" };
    default:
      return { title: "Preview couldn't render", body: detail || "The newsroom couldn't prepare this story.", action: "Try again" };
  }
}

/* --------------------------------------------------------------------- page */

function LivePreviewPage({ origin, publication, fixtures }: { origin: string; publication: PreviewPublication; fixtures: boolean }) {
  // One population bridge for this page's lifetime (stable identity: see the note above).
  const [population] = useState(createStoryPopulation);
  const { data } = useLivePreview<StoryDoc>({
    initialData: NO_INITIAL_DATA,
    serverURL: origin,
    depth: STORY_LIVE_PREVIEW_DEPTH,
    requestHandler: population.requestHandler
  });
  const status: PopulationStatus = useSyncExternalStore(population.subscribe, population.getStatus, population.getStatus);
  const doc = isStoryDoc(data) ? data : null;
  const context = useStoryContext(doc);
  const registry = useMemo(() => storyPresentationRegistry({ fixtures }), [fixtures]);
  const interactives = useMemo(() => repositoryInteractiveRegistry({ fixtures }), [fixtures]);

  const built = useMemo(() => (doc ? build(doc, context, publication, interactives) : null), [doc, context, publication, interactives]);
  // The last article that rendered, kept only as a rendering fallback (never edited, never saved).
  const lastGood = useRef<ArticlePresentation | null>(null);
  if (built?.ok) lastGood.current = built.presentation;
  const presentation = built?.ok ? built.presentation : lastGood.current;

  const resolution = presentation ? resolveStoryPresentation(presentation, registry) : null;
  const assets = useStoryAssets(resolution?.entry ?? null);
  useKeepPreviewInPlace(publication.publicSite);
  useArticleEnhancements(presentation, interactives);

  const slots = useMemo(() => inertSlots(publication, interactives), [publication, interactives]);
  const onRetry = useCallback(() => reload(), []);

  if (!presentation) {
    if (status.state === "failed") {
      const message = failureMessage(status.reason, status.message);
      return <Message title={message.title} action={message.action ? <ReloadButton label={message.action} /> : undefined}>{message.body}</Message>;
    }
    if (built && !built.ok) {
      return <Message title="Preview couldn't render" action={<button type="button" onClick={onRetry}>Try again</button>}>{built.error}</Message>;
    }
    return <Message title="Connecting…" />;
  }

  // A repository story's stylesheet is its own chunk; show the article only once it is in.
  if (!assets.ready) return <Message title="Preparing preview…" />;

  const stale = status.state === "failed" && status.hasResult && status.reason !== "unsaved";
  const renderFailed = built && !built.ok;
  return (
    <div className="byline-preview-page" data-presentation={resolution?.resolved} data-presentation-reason={resolution?.reason}>
      {stale || renderFailed ? <p className="byline-preview-stale" role="status">Preview may be out of date</p> : null}
      <StoryArticle presentation={presentation} slots={slots} registry={registry} host={assets.host} />
    </div>
  );
}

export function StoryPreview({ signedIn, publication, fixtures }: { signedIn: boolean; publication: PreviewPublication; fixtures: boolean }) {
  // `useLivePreview` identifies messages by origin; the page only knows it in the browser.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
  if (!signedIn) {
    return <Message title="Preview unavailable" action={<ReloadButton label="Reload" />}>Your session may have expired. Sign in to the newsroom, then reload.</Message>;
  }
  if (!origin) return <Message title="Connecting…" />;
  return <LivePreviewPage origin={origin} publication={publication} fixtures={fixtures} />;
}
