// Studio's preview data model and its one resolution pass.
//
// Deliberately free of React and of the WordPress client: it is plain TypeScript
// over the REST shapes, which is what lets the production parity test import it
// and compare Studio's resolution against the static site's directly. If this
// module needed `@wordpress/api-fetch` there would be no way to prove the two
// hosts agree except by reading them both.
//
// Studio does not have a resolver. It adapts its own preview content and then
// calls the identical `resolveHomepageDocument` the static export calls, over
// the identical design document, so the canvas cannot select different stories
// from the published page.
//
// The previous implementation resolved every package as an independent mini
// homepage: each preview component ran its own selection with its own empty
// used-story set. That is what produced repeated articles across packages and a
// Special Coverage section filled with generic recent stories. There is now one
// document-level model, computed once and shared by every package render.
import {
  resolveHomepageDocument,
  type HomepageCoverageInput,
  type HomepagePublicationInput,
  type HomepageStoryInput
} from "@byline/content";
import {
  cleanDeckText,
  type AthleteSpotlightView,
  type CalendarEntryView,
  type ResolvedHomepagePackage,
  type SportsFixtureView,
  type SportsResultView,
  type StoryView
} from "@byline/ui";
import type { BylineDesignDocumentV2 } from "@byline/design";
import {
  analyzeResolvedDesign,
  semanticDesignDiff,
  type DesignDiff,
  type DesignIntelligence
} from "./design-intelligence-model";

export type StudioPreviewPublication = HomepagePublicationInput;

export type PreviewPost = {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  // Requested so the clean-deck treatment reads the same field the published
  // page reads. Optional because a caller may narrow the REST response.
  content?: { rendered: string };
  date: string;
  link: string;
  sticky?: boolean;
  categories?: number[];
  tags?: number[];
  author?: number;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number } }>;
    "wp:term"?: Array<Array<{ id?: number; taxonomy: string; name: string; slug: string }>>;
    author?: Array<{ name: string; link: string }>;
  };
};

function decodeEntities(value: string) {
  if (typeof document === "undefined") return value;

  const element = document.createElement("textarea");
  element.innerHTML = value;

  return element.value;
}

function stripTags(value: string) {
  let text = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") insideTag = true;
    else if (character === ">") insideTag = false;
    else if (!insideTag) text += character;
  }

  return text.replace(/\s+/g, " ").trim();
}

// The Studio-side equivalent of the static site's toStoryView. It reads the
// REST shape rather than the build-time shape, and produces the identical view
// model.
function toStoryView(post: PreviewPost): StoryView {
  const media = post._embedded?.["wp:featuredmedia"]?.[0];
  const category = post._embedded?.["wp:term"]?.flat().find((term) => term?.taxonomy === "category") ?? null;
  const author = post._embedded?.author?.[0] ?? null;
  const path = (() => {
    try {
      return new URL(post.link).pathname;
    } catch {
      return post.link;
    }
  })();

  return {
    id: post.id,
    title: decodeEntities(stripTags(post.title.rendered)),
    href: path,
    deck: post.excerpt.rendered.trim(),
    deckIsHtml: true,
    isoDate: post.date,
    displayDate: new Date(post.date).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }),
    readingTime: null,
    category: category ? { name: decodeEntities(category.name), href: `/category/${category.slug}/` } : null,
    author: author ? { name: author.name, href: null } : null,
    image: media?.source_url
      ? {
          src: media.source_url,
          alt: media.alt_text || "",
          width: media.media_details?.width ?? null,
          height: media.media_details?.height ?? null
        }
      : null
  };
}

function postTermSlugs(post: PreviewPost, taxonomy: string) {
  return (post._embedded?.["wp:term"]?.flat() ?? [])
    .filter((term) => term?.taxonomy === taxonomy)
    .map((term) => term.slug);
}

function toAthleteSpotlightView(post: PreviewPost): AthleteSpotlightView {
  const story = toStoryView(post);

  return {
    id: story.id,
    name: story.title.replace(/^athlete\s+of\s+the\s+(?:week|month)\s*:?\s*/i, "").trim(),
    href: story.href,
    eyebrow: /athlete of the month/i.test(story.title) ? "Athlete of the Month" : "Athlete of the Week",
    sport: story.category?.name ?? null,
    blurb: stripTags(story.deck) || null,
    image: story.image
  };
}

// Studio's adapter into the canonical resolver. Its counterpart on the static
// site is apps/web/lib/homepage-story-input.ts; from here on both hosts run
// identical code.
export function toPreviewStoryInput(post: PreviewPost): HomepageStoryInput {
  const tagSlugs = postTermSlugs(post, "post_tag");

  return {
    id: post.id,
    sticky: post.sticky === true,
    categorySlugs: postTermSlugs(post, "category"),
    categoryIds: post.categories ?? [],
    tagIds: post.tags ?? [],
    authorId: post.author ?? null,
    hasFeaturedImage: Boolean(post._embedded?.["wp:featuredmedia"]?.length),
    isAthleteSpotlight: tagSlugs.includes("athlete-of-the-week") || tagSlugs.includes("athlete-of-the-month"),
    isSpecialCoverage: tagSlugs.includes("special-coverage"),
    view: toStoryView(post),
    // Packages configured for the clean deck -- More and the Sports lead --
    // must show the same trimmed two sentences the published page shows, or
    // they measure taller in the canvas than they do for a reader. Studio only
    // has the excerpt, so it cleans that; the treatment itself is shared.
    cleanDeckView: {
      ...toStoryView(post),
      // Same field precedence as the static site: the body first, the excerpt
      // as the fallback. Reading only the excerpt here is what made the More
      // rail and the Sports lead measure differently in the canvas.
      deck: cleanDeckText(stripTags(post.content?.rendered || post.excerpt.rendered)),
      deckIsHtml: false
    },
    athleteSpotlightView: toAthleteSpotlightView(post)
  };
}

// The sports endpoints' records, narrowed to the fields the preview reads.
export type PreviewGame = {
  id: number;
  title?: string;
  sportKey?: string;
  sport?: string;
  level?: string;
  opponent?: string;
  site?: string;
  startDate?: string;
  status?: string;
  recapUrl?: string;
  notes?: string;
  wildcatsScore?: number | null;
  opponentScore?: number | null;
  display?: {
    matchup?: string;
    date?: string;
    location?: string;
    status?: string;
    score?: string | null;
    sportLevel?: string;
    scoreboard?: {
      team?: { label?: string; score?: number | null };
      wildcats?: { label?: string; score?: number | null };
      opponent?: { label?: string; score?: number | null };
    };
  };
};

const SPORT_ICONS: Array<[string, string]> = [
  ["baseball", "mdi:baseball"],
  ["softball", "mdi:baseball"],
  ["basketball", "mdi:basketball"],
  ["football", "mdi:football"],
  ["soccer", "mdi:soccer"],
  ["volleyball", "mdi:volleyball"],
  ["tennis", "mdi:tennis-ball"],
  ["golf", "mdi:golf"],
  ["track", "mdi:run-fast"],
  ["cross country", "mdi:run-fast"],
  ["wrestling", "mdi:boxing-glove"],
  ["cheer", "mdi:bullhorn"],
  ["swim", "mdi:swim"]
];

function previewSportIcon(game: PreviewGame) {
  const sport = [game.sportKey, game.sport].filter(Boolean).join(" ").toLowerCase();

  return SPORT_ICONS.find(([needle]) => sport.includes(needle))?.[1] ?? "mdi:whistle";
}

function previewSportLabel(game: PreviewGame) {
  return game.display?.sportLevel || [game.sport, game.level].filter(Boolean).join(" · ") || "Sports";
}

function previewSiteLabel(game: PreviewGame) {
  if (game.site === "home") return "Home";
  if (game.site === "away") return "Away";
  if (game.site === "neutral") return "Neutral Site";

  return "";
}

function previewScore(score: number | null | undefined) {
  return score === null || score === undefined ? "—" : String(score);
}

export function toSportsResultView(game: PreviewGame): SportsResultView {
  const scoreboard = game.display?.scoreboard;
  const teamLabel = scoreboard?.team?.label ?? scoreboard?.wildcats?.label ?? "Home";
  const teamScore = scoreboard?.team?.score ?? scoreboard?.wildcats?.score ?? game.wildcatsScore ?? null;
  const opponentLabel = game.opponent || scoreboard?.opponent?.label || "Opponent";
  const opponentScore = scoreboard?.opponent?.score ?? game.opponentScore ?? null;
  const decided = teamScore !== null && opponentScore !== null;

  return {
    id: game.id,
    sportLabel: previewSportLabel(game),
    iconName: previewSportIcon(game),
    matchup: game.display?.matchup || game.title || "",
    scoreLabel: game.display?.score || null,
    team: { label: teamLabel, score: previewScore(teamScore), isWinner: decided && teamScore > opponentScore },
    opponent: {
      label: opponentLabel,
      score: previewScore(opponentScore),
      isWinner: decided && opponentScore > teamScore
    },
    verdict: game.display?.score || game.display?.status || "Final",
    context: game.notes?.trim() || previewSiteLabel(game),
    recapHref: game.recapUrl || null
  };
}

export function toSportsFixtureView(game: PreviewGame): SportsFixtureView {
  return {
    id: game.id,
    isoDate: game.startDate ?? "",
    displayDate: game.display?.date || game.startDate || "",
    siteLabel: previewSiteLabel(game),
    sportLabel: previewSportLabel(game),
    matchup: game.display?.matchup || game.title || "",
    location: game.display?.location || ""
  };
}

// --- preview data -----------------------------------------------------------

export type PreviewData = {
  stories: HomepageStoryInput[];
  events: CalendarEntryView[];
  recentScores: SportsResultView[];
  upcomingGames: SportsFixtureView[];
  /** Public-safe Coverage relationship/status data supplied by the host loader. */
  coverages?: HomepageCoverageInput[];
};

export type PreviewDataLoader = () => Promise<PreviewData>;

let previewRequest: Promise<PreviewData> | null = null;
let previewLoader: PreviewDataLoader | null = null;

/**
 * Registers the transport that supplies preview content.
 *
 * The transport is injected rather than imported so this module stays free of
 * the WordPress client: fetching is a host concern, resolution is not. Studio
 * registers the REST loader; tests supply data directly.
 */
export function setPreviewDataLoader(loader: PreviewDataLoader) {
  previewLoader = loader;
}

/**
 * Loaded once per Studio session and shared by every preview render.
 *
 * One request set for the whole editor, not one per package: dragging a package
 * around, editing a heading or re-rendering the canvas must never issue new
 * WordPress queries.
 */
export function loadPreviewData(): Promise<PreviewData> {
  previewRequest ??= previewLoader
    ? previewLoader()
    : Promise.resolve({ stories: [], events: [], recentScores: [], upcomingGames: [] });

  return previewRequest;
}

/**
 * Builds a preview data set from raw REST records.
 *
 * Exported because it is the adapter half of Studio's resolution: the parity
 * test feeds it the same content the static site is given and compares the two
 * resolutions.
 */
export function toPreviewData(input: {
  posts: PreviewPost[];
  events?: Array<Record<string, unknown>>;
  recentScores?: PreviewGame[];
  upcomingGames?: PreviewGame[];
  coverages?: readonly HomepageCoverageInput[];
}): PreviewData {
  return {
    stories: input.posts.map(toPreviewStoryInput),
    recentScores: (input.recentScores ?? []).map(toSportsResultView),
    upcomingGames: (input.upcomingGames ?? []).map(toSportsFixtureView),
    events: (input.events ?? []).slice(0, 8).map((event, index) => ({
      id: `event-${index}`,
      kind: "event" as const,
      label: String(event.eventType ?? "School Event"),
      title: String(event.title ?? ""),
      date: String((event.display as Record<string, unknown>)?.date ?? ""),
      location: String(event.location ?? ""),
      href: ""
    })),
    // Coverage records are intentionally opt-in. The Studio host can pass
    // only public-safe relationship/status fields here without making this
    // preview model depend on an editorial or public-site endpoint.
    ...(input.coverages ? { coverages: [...input.coverages] } : {})
  };
}

function previewCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  for (const key of ["items", "coverage", "coverages", "data"]) {
    if (Array.isArray(record[key])) return record[key];
  }

  return [];
}

/**
 * Converts the public Coverage endpoint to the relationship-only data used by
 * the shared homepage resolver.  This deliberately ignores every editorial
 * field other than the public flag and published story IDs.
 */
export function toPreviewCoverageInputs(value: unknown): HomepageCoverageInput[] {
  return previewCollection(value).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];

    const record = entry as Record<string, unknown>;
    const id = typeof record.id === "number" ? record.id : Number(record.id ?? record.coverageId);
    if (!Number.isInteger(id) || id <= 0) return [];

    const stories = [record.stories, record.posts, record.linkedStories, record.publicStories]
      .find(Array.isArray) ?? [];
    const storyIds = stories.flatMap((story) => {
      if (!story || typeof story !== "object") return [];
      const storyRecord = story as Record<string, unknown>;
      const storyId = typeof storyRecord.id === "number" ? storyRecord.id : Number(storyRecord.id);
      return Number.isInteger(storyId) && storyId > 0 ? [storyId] : [];
    });
    const isPublic = record.public === false || record.isPublic === false || record.publicLandingPage === false
      ? false
      : true;

    return [{ id, storyIds: [...new Set(storyIds)], isPublic, exists: true }];
  });
}

// Test seam. Studio never calls this; it exists so the resolution contract can
// be exercised without a WordPress REST transport.
export function __setPreviewDataForTests(data: PreviewData | null) {
  previewRequest = data ? Promise.resolve(data) : null;
  store.data = data;
  recomputeModel();
  emit();
}

// --- the document-level preview model ---------------------------------------

type PreviewStore = {
  data: PreviewData | null;
  document: BylineDesignDocumentV2 | null;
  publication: StudioPreviewPublication | null;
  model: Map<string, ResolvedHomepagePackage> | null;
  intelligence: DesignIntelligence | null;
  semanticDiff: DesignDiff | null;
  liveDocument: BylineDesignDocumentV2 | null;
  // Editor-only markers for packages that resolve to nothing. The canvas is
  // reader-accurate when this is off, and still navigable when it is on.
  showHiddenPackages: boolean;
  listeners: Set<() => void>;
};

const store: PreviewStore = {
  data: null,
  document: null,
  publication: null,
  model: null,
  intelligence: null,
  semanticDiff: null,
  liveDocument: null,
  showHiddenPackages: true,
  listeners: new Set()
};

function emit() {
  for (const listener of store.listeners) listener();
}

function recomputeModel() {
  if (!store.data || !store.document || !store.publication) {
    store.model = null;
    store.intelligence = null;
    store.semanticDiff = null;
    return;
  }

  const resolved = resolveHomepageDocument({
    document: store.document,
    stories: store.data.stories,
    publication: store.publication,
    sportsSchedule: {
      recentScores: store.data.recentScores,
      upcomingGames: store.data.upcomingGames
    },
    coverages: store.data.coverages
  });

  store.model = new Map(resolved.packages.map((entry) => [entry.package.packageId, entry]));
  store.intelligence = analyzeResolvedDesign({
    document: store.document,
    packages: resolved.packages,
    coverages: store.data.coverages
  });
  store.semanticDiff = store.liveDocument
    ? semanticDesignDiff(store.document, store.liveDocument)
    : null;
}

/**
 * Publishes the document Studio is currently editing.
 *
 * Called by the editor shell on load and on every change, so the canvas always
 * previews the same document an autosave would write. Resolution happens here,
 * once for the whole page, rather than inside any package renderer.
 */
export function setStudioPreviewDocument(
  document: BylineDesignDocumentV2,
  publication: StudioPreviewPublication,
  liveDocument?: BylineDesignDocumentV2 | null
) {
  store.document = document;
  store.publication = publication;
  if (liveDocument !== undefined) store.liveDocument = liveDocument;
  recomputeModel();
  emit();
}

/**
 * Supplies the last published document used by the Studio's draft/live
 * comparison surface. It is separate from the draft setter so an autosave
 * does not accidentally replace the immutable live baseline.
 */
export function setStudioPreviewLiveDocument(document: BylineDesignDocumentV2 | null) {
  store.liveDocument = document;
  recomputeModel();
  emit();
}

/** Replaces the public-safe Coverage catalog without changing the preview document. */
export function setStudioPreviewCoverages(coverages: readonly HomepageCoverageInput[]) {
  if (store.data) store.data = { ...store.data, coverages: [...coverages] };
  recomputeModel();
  emit();
}

export function setStudioPreviewOptions(options: { showHiddenPackages: boolean }) {
  store.showHiddenPackages = options.showHiddenPackages;
  emit();
}

export function subscribe(listener: () => void) {
  store.listeners.add(listener);

  if (!store.data) {
    loadPreviewData().then((data) => {
      store.data = data;
      recomputeModel();
      emit();
    });
  }

  return () => {
    store.listeners.delete(listener);
  };
}

export type PreviewSnapshot = {
  ready: boolean;
  events: CalendarEntryView[];
  entry: ResolvedHomepagePackage | null;
  showHiddenPackages: boolean;
  intelligence: DesignIntelligence | null;
  semanticDiff: DesignDiff | null;
};

export function snapshotFor(packageId: string): PreviewSnapshot {
  return {
    ready: Boolean(store.data && store.model),
    events: store.data?.events ?? [],
    entry: store.model?.get(packageId) ?? null,
    showHiddenPackages: store.showHiddenPackages,
    intelligence: store.intelligence,
    semanticDiff: store.semanticDiff
  };
}

export function studioPreviewIntelligence(): DesignIntelligence | null {
  return store.intelligence;
}

export function studioPreviewDiff(): DesignDiff | null {
  return store.semanticDiff;
}

export const getStudioPreviewIntelligence = studioPreviewIntelligence;
export const getStudioPreviewDiff = studioPreviewDiff;

export function previewPackageId(props: unknown, fallback: string) {
  return props && typeof props === "object" && typeof (props as Record<string, unknown>).id === "string"
    ? (props as Record<string, unknown>).id as string
    : fallback;
}
