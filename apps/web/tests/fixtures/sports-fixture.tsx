import type { SportsGame } from "@/lib/headless";
import type { WordPressCategory, WordPressPost, WordPressTag } from "@/lib/wordpress";

// Shared fixture builders for the sports package tests.
//
// The shapes mirror what the live endpoints return, including the fields the
// pre-Studio components fell back through: `display.*` first, then the flat
// record, then a literal default.

export function category(id: number, slug: string): WordPressCategory {
  return { id, count: 1, description: "", link: "", name: slug, slug, taxonomy: "category", parent: 0 };
}

export function tag(id: number, slug: string, name = slug): WordPressTag {
  return { id, count: 1, description: "", link: "", name, slug, taxonomy: "post_tag" } as WordPressTag;
}

export type PostOptions = {
  sticky?: boolean;
  image?: boolean;
  // Carries the athlete-of-the-week flag, which the ordered pass claims first.
  athlete?: boolean;
  title?: string;
  excerpt?: string;
};

export function post(id: number, categorySlug: string, options: PostOptions = {}): WordPressPost {
  const tags: WordPressTag[] = options.athlete
    ? [tag(id + 500, "athlete-of-the-week", "Athlete of the Week"), tag(id + 600, "soccer", "Sport: Soccer")]
    : [];

  return {
    id,
    date: `2026-08-${String(id).padStart(2, "0")}T12:00:00`,
    date_gmt: "2026-08-01T16:00:00",
    modified: "2026-08-01T12:00:00",
    modified_gmt: "2026-08-01T16:00:00",
    slug: `story-${id}`,
    status: "publish",
    type: "post",
    link: `https://example.test/story-${id}`,
    title: { rendered: options.title ?? `Story ${id}` },
    content: { rendered: `<p>Body sentence one. Body sentence two. Body sentence three.</p>` },
    excerpt: { rendered: options.excerpt ?? `<p>Deck ${id}</p>` },
    author: 1,
    featured_media: options.image ? id + 2000 : 0,
    categories: [id],
    tags: tags.map((entry) => entry.id),
    sticky: Boolean(options.sticky),
    _embedded: {
      "wp:featuredmedia": options.image
        ? [
            {
              id: id + 2000,
              date: "2026-08-01T12:00:00",
              slug: `image-${id}`,
              type: "attachment",
              link: "",
              title: { rendered: "Image" },
              author: 1,
              caption: { rendered: "" },
              alt_text: `Alt ${id}`,
              media_type: "image",
              mime_type: "image/jpeg",
              source_url: `https://example.test/image-${id}.jpg`,
              media_details: { width: 1024, height: 576 }
            }
          ]
        : [],
      "wp:term": [[category(id, categorySlug)], tags]
    }
  } as unknown as WordPressPost;
}

export type GameOptions = {
  upcoming?: boolean;
  status?: SportsGame["status"];
  // Strips every optional display field so the fallback chain is exercised.
  blank?: boolean;
  site?: SportsGame["site"];
  notes?: string;
  teamScore?: number | null;
  opponentScore?: number | null;
  recapUrl?: string;
};

export function game(id: number, sport: string, options: GameOptions = {}): SportsGame {
  const upcoming = options.upcoming ?? false;
  const status = options.status ?? (upcoming ? "upcoming" : "final");
  const teamScore = options.teamScore === undefined ? (upcoming ? null : 24) : options.teamScore;
  const opponentScore = options.opponentScore === undefined ? (upcoming ? null : 17) : options.opponentScore;

  if (options.blank) {
    return {
      id,
      title: `Game ${id}`,
      slug: `game-${id}`,
      sportKey: "",
      sport: "",
      sportLabel: "",
      level: "",
      teamLabel: "",
      team: null,
      opponent: "",
      site: "",
      location: "",
      locationName: "",
      locationAddress: "",
      latitude: null,
      longitude: null,
      appleMapsId: "",
      startDate: "",
      season: "2026",
      status,
      wildcatsScore: null,
      opponentScore: null,
      recapUrl: "",
      notes: "",
      display: { matchup: "", date: "", location: "", status: "", score: null }
    } as unknown as SportsGame;
  }

  return {
    id,
    title: `Wildcats vs Rivals ${id}`,
    slug: `game-${id}`,
    sportKey: sport,
    sport: sport.slice(0, 1).toUpperCase() + sport.slice(1),
    sportLabel: sport,
    level: "Varsity",
    teamLabel: `${sport} varsity`,
    team: null,
    opponent: `Rivals ${id}`,
    site: options.site ?? (id % 2 === 0 ? "away" : "home"),
    location: "",
    locationName: `Field ${id}`,
    locationAddress: "",
    latitude: null,
    longitude: null,
    appleMapsId: "",
    startDate: `2026-09-${String((id % 27) + 1).padStart(2, "0")}T19:00:00`,
    season: "2026",
    status,
    wildcatsScore: teamScore,
    teamScore,
    opponentScore,
    recapUrl: options.recapUrl ?? "",
    notes: options.notes ?? "",
    display: {
      matchup: `Wildcats vs Rivals ${id}`,
      date: `Sep ${(id % 27) + 1}, 2026 7:00 PM`,
      location: `Field ${id}`,
      status: upcoming ? "Upcoming" : "Final",
      score: upcoming ? null : `${teamScore}-${opponentScore}`,
      sportLevel: `${sport.slice(0, 1).toUpperCase()}${sport.slice(1)} · Varsity`,
      scoreboard: {
        wildcats: { label: "Wildcats", score: teamScore },
        opponent: { label: `Rivals ${id}`, score: opponentScore }
      }
    }
  } as unknown as SportsGame;
}
