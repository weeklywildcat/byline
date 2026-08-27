import apiFetch from "@wordpress/api-fetch";
import { useEffect, useState } from "@wordpress/element";
import {
  LeadPackage,
  PollCard,
  ThisWeekCard,
  getLeadPackageRenderer,
  type CalendarEntryView,
  type ResolvedLeadPackage,
  type StoryView
} from "@byline/ui";
import { parseLeadPackageProps, type LeadPackageProps } from "@byline/design";

// Studio's preview data.
//
// Production resolves this during the static export from the full post list;
// Studio resolves it here from the authenticated WordPress REST API. The
// transports differ deliberately -- what must not differ is the resolved model
// or the renderer, so both sides produce a ResolvedLeadPackage and hand it to
// the same component.
type PreviewPost = {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  link: string;
  sticky?: boolean;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number } }>;
    "wp:term"?: Array<Array<{ taxonomy: string; name: string; slug: string }>>;
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

// The Studio-side equivalent of lib/homepage-packages.toStoryView. It reads the
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
      : null,
    opinionTreatment: false
  };
}

type PreviewData = {
  posts: PreviewPost[];
  events: CalendarEntryView[];
};

let previewRequest: Promise<PreviewData> | null = null;

// Fetched once per Studio session and shared by every preview render, so
// dragging a package around does not re-query WordPress.
function loadPreviewData(): Promise<PreviewData> {
  previewRequest ??= Promise.all([
    apiFetch<PreviewPost[]>({ path: "/wp/v2/posts?per_page=12&_embed=1&status=publish" }).catch(() => []),
    apiFetch<Array<Record<string, unknown>>>({ path: "/weekly-wildcat/v1/school-events?per_page=6" }).catch(() => [])
  ]).then(([posts, events]) => ({
    posts,
    events: events.slice(0, 6).map((event, index) => ({
      id: `event-${index}`,
      kind: "event" as const,
      label: String(event.eventType ?? "School Event"),
      title: String(event.title ?? ""),
      date: String((event.display as Record<string, unknown>)?.date ?? ""),
      location: String(event.location ?? ""),
      href: ""
    }))
  }));

  return previewRequest;
}

// Mirrors resolveLeadPackage's selection rules for the preview's smaller post
// window: sticky-first lead, then the next unused stories for the rail.
function resolvePreviewLeadPackage(
  config: LeadPackageProps,
  data: PreviewData,
  features: { polls: boolean; events: boolean; sports: boolean },
  publicationShortName: string
): ResolvedLeadPackage {
  const byId = new Map(data.posts.map((post) => [post.id, post]));
  const manualLead = config.lead.source.type === "manual" ? byId.get(config.lead.source.storyIds[0]) : undefined;
  const lead = manualLead ?? data.posts.find((post) => post.sticky) ?? data.posts[0] ?? null;

  const manualLatest =
    config.latest.source.type === "manual"
      ? config.latest.source.storyIds.flatMap((id) => {
          const post = byId.get(id);

          return post ? [post] : [];
        })
      : null;

  const latest = (manualLatest ?? data.posts)
    .filter((post) => post.id !== lead?.id)
    .slice(0, config.latest.limit);

  return {
    packageId: "home-lead",
    lead: lead ? toStoryView(lead) : null,
    latest: {
      heading: config.latest.heading,
      stories: latest.map(toStoryView),
      showBylines: config.latest.showBylines
    },
    utility: {
      poll: config.utility.poll && features.polls,
      calendar: config.utility.calendar && (features.events || features.sports)
    },
    presentation: { showDeck: config.presentation.showDeck, opinionTreatment: false },
    fallbackAuthorName: `${publicationShortName} Staff`,
    emptyMessage: "No published posts are available yet."
  };
}

export type LeadPackagePreviewProps = {
  props: unknown;
  theme: string;
  features: { polls: boolean; events: boolean; sports: boolean };
  publicationShortName: string;
  calendarHeading: string;
};

/**
 * Studio's lead package preview.
 *
 * There is no placeholder here: this mounts the same LeadPackage renderer the
 * static site uses, with real headlines, real images, real decks and the real
 * poll and calendar cards.
 */
export function LeadPackagePreview({
  props,
  theme,
  features,
  publicationShortName,
  calendarHeading
}: LeadPackagePreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadPreviewData().then((loaded) => {
      if (!cancelled) setData(loaded);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const config = parseLeadPackageProps(props);

  if (!data) {
    return <p className="byline-preview-loading">Loading publication content…</p>;
  }

  const resolved = resolvePreviewLeadPackage(config, data, features, publicationShortName);
  const Renderer = getLeadPackageRenderer(theme);

  return (
    <Renderer
      package={resolved}
      pollSlot={
        <PollCard>
          <p className="homepage-poll-note">Live poll results appear on the published site.</p>
        </PollCard>
      }
      calendarSlot={
        <ThisWeekCard entries={data.events} heading={calendarHeading} scheduleHref="/sports/schedule/" />
      }
    />
  );
}
