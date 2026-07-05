import type { Metadata } from "next";
import { SearchPageClient, type SearchIndexItem } from "@/components/SearchPageClient";
import { filterVisibleContentPosts, getPrimaryVisibleCategory, getPublicTopicTags } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { getAllSportsGames } from "@/lib/headless";
import { buildPageMetadata } from "@/lib/seo";
import { buildTeams, getGameHref, getSeasonHref, getTeamHubHref } from "@/lib/sports";
import { getAllPosts, getPostAuthor, getPostHref } from "@/lib/wordpress";

export const dynamic = "force-static";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Search",
    description: "Search Weekly Wildcat stories by headline, author, section, or topic.",
    path: "/search/",
    noIndex: true
  })
};

function getSearchExcerpt(value: string) {
  const text = stripHtml(value).replace(/\s*\[\s*(?:&hellip;|…|\.\.\.)\s*\]\s*$/i, "");

  if (text.length <= 180) {
    return text;
  }

  const trimmed = text.slice(0, 180);
  const lastSpace = trimmed.lastIndexOf(" ");

  return `${trimmed.slice(0, lastSpace > 0 ? lastSpace : trimmed.length).trim()}...`;
}

export default async function SearchPage() {
  const [posts, games] = await Promise.all([getAllPosts(), getAllSportsGames().catch(() => [])]);
  const visiblePosts = filterVisibleContentPosts(posts);
  const teams = buildTeams(games);
  const storyItems: SearchIndexItem[] = visiblePosts.map((post) => {
    const title = stripHtml(post.title.rendered);
    const excerpt = getSearchExcerpt(post.excerpt.rendered || post.content.rendered);
    const category = getPrimaryVisibleCategory(post);
    const author = getPostAuthor(post);
    const topics = getPublicTopicTags(post).map((tag) => stripHtml(tag.name));

    return {
      id: post.id,
      kind: "story",
      title,
      excerpt,
      href: getPostHref(post),
      category: category ? stripHtml(category.name) : "",
      author: author?.name ?? "Weekly Wildcat Staff",
      date: formatDisplayDate(post.date),
      searchText: [title, excerpt, category?.name, author?.name, ...topics].filter(Boolean).join(" ").toLowerCase()
    };
  });
  const teamItems: SearchIndexItem[] = teams.map((team) => ({
    id: `team-${team.slug}`,
    kind: "team",
    title: team.name,
    excerpt: `${team.seasons.length} season${team.seasons.length === 1 ? "" : "s"} available. Latest season: ${team.latestSeason}.`,
    href: getTeamHubHref(team),
    category: "Team Hub",
    author: "Weekly Wildcat Sports",
    date: team.latestSeason,
    searchText: [team.slug, team.name, team.shortName, ...team.sportKeys, ...team.seasons].join(" ").toLowerCase()
  }));
  const seasonItems: SearchIndexItem[] = teams.flatMap((team) =>
    team.seasons.map((year) => ({
      id: `season-${team.slug}-${year}`,
      kind: "season" as const,
      title: `${team.name} ${year}`,
      excerpt: `Schedule and results for the ${year} ${team.name} season.`,
      href: getSeasonHref(team, year),
      category: "Season Archive",
      author: "Weekly Wildcat Sports",
      date: year,
      searchText: [team.slug, team.name, team.shortName, year, "schedule", "scores", "results"].join(" ").toLowerCase()
    }))
  );
  const gameItems: SearchIndexItem[] = games.map((game) => ({
    id: `game-${game.id}`,
    kind: "game",
    title: game.display.matchup || game.title,
    excerpt: [game.display.date, game.display.location, game.display.status, game.display.score].filter(Boolean).join(" · "),
    href: getGameHref(game),
    category: "Game",
    author: game.display.sportLevel || game.sportLabel || "Weekly Wildcat Sports",
    date: game.display.date || game.startDate,
    searchText: [
      game.id,
      game.sportKey,
      game.sport,
      game.sportLabel,
      game.level,
      game.teamLabel,
      game.opponent,
      game.site,
      game.locationName,
      game.locationAddress,
      game.startDate,
      game.display.matchup,
      game.display.status,
      game.display.score
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  }));
  const items = [...teamItems, ...seasonItems, ...storyItems, ...gameItems];

  return (
    <main className="search-page-shell">
      <SearchPageClient items={items} />
    </main>
  );
}
