import { optionalBuildData } from "@/lib/build-data";
import type { Metadata } from "next";
import { SearchPageClient, type SearchIndexItem } from "@/components/SearchPageClient";
import { filterVisibleContentPosts, getPrimaryVisibleCategory, getPublicTopicTags } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { getAllSportsGames, getAllSportsRosters, getSportsTeams } from "@/lib/headless";
import { buildPageMetadata } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { getBylineRestUrl } from "@/lib/byline-rest";
import { toSearchFacetValue } from "@/lib/search";
import { buildTeams, getGameHref, getSeasonHref, getTeamHubHref } from "@/lib/sports";
import { getAllPosts, getPostContributors, getPostHref } from "@/lib/wordpress";

export const dynamic = "force-static";
const publication = getPublicationConfig();

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Search",
    description: `Search ${publication.identity.shortName} stories by headline, author, section, or topic.`,
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
  const [posts, games, rosters, teamRecords] = await Promise.all([
    getAllPosts(),
    publication.features.sports
      ? optionalBuildData("/wp-json/weekly-wildcat/v1/sports-games", getAllSportsGames, [])
      : [],
    publication.features.sports
      ? optionalBuildData("/wp-json/weekly-wildcat/v1/sports-rosters", getAllSportsRosters, [])
      : [],
    publication.features.sports
      ? optionalBuildData("/wp-json/weekly-wildcat/v1/sports-teams", getSportsTeams, [])
      : []
  ]);
  const visiblePosts = filterVisibleContentPosts(posts);
  const teams = buildTeams(games, rosters, teamRecords);
  const storyItems: SearchIndexItem[] = visiblePosts.map((post) => {
    const title = stripHtml(post.title.rendered);
    const excerpt = getSearchExcerpt(post.excerpt.rendered || post.content.rendered);
    const category = getPrimaryVisibleCategory(post);
    const contributors = getPostContributors(post);
    const topicEntries = getPublicTopicTags(post).map((tag) => ({
      value: tag.slug,
      label: stripHtml(tag.name)
    }));
    const authorName = contributors.length > 0
      ? contributors.map((contributor) => contributor.name).join(", ")
      : `${publication.identity.shortName} Staff`;
    const sectionLabel = category ? stripHtml(category.name) : "";

    return {
      id: post.id,
      kind: "story",
      title,
      excerpt,
      href: getPostHref(post),
      category: sectionLabel,
      section: category?.slug ?? "",
      sectionLabel,
      author: authorName,
      authorKey: contributors.length > 0 ? contributors.map((contributor) => contributor.slug).join(",") : toSearchFacetValue(authorName),
      authorOptions: contributors.map((contributor) => ({ value: contributor.slug, label: contributor.name })),
      topics: topicEntries.map((topic) => topic.value),
      topicLabels: Object.fromEntries(topicEntries.map((topic) => [topic.value, topic.label])),
      date: formatDisplayDate(post.date),
      sortDate: post.date,
      searchText: [
        title,
        excerpt,
        sectionLabel,
        category?.slug,
        authorName,
        ...contributors.flatMap((contributor) => [contributor.name, contributor.slug]),
        ...topicEntries.flatMap((topic) => [topic.label, topic.value])
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
    };
  });
  const teamItems: SearchIndexItem[] = teams.map((team) => ({
    id: `team-${team.slug}`,
    kind: "team",
    title: team.name,
    excerpt: `${team.seasons.length} season${team.seasons.length === 1 ? "" : "s"} available. Latest season: ${team.latestSeason}.`,
    href: getTeamHubHref(team),
    category: "Team Hub",
    section: "sports",
    sectionLabel: "Sports",
    author: `${publication.identity.shortName} Sports`,
    authorKey: toSearchFacetValue(`${publication.identity.shortName} Sports`),
    date: team.latestSeason,
    sortDate: team.latestSeason,
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
      section: "sports",
      sectionLabel: "Sports",
      author: `${publication.identity.shortName} Sports`,
      authorKey: toSearchFacetValue(`${publication.identity.shortName} Sports`),
      date: year,
      sortDate: `${year}-01-01`,
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
    section: "sports",
    sectionLabel: "Sports",
    author: game.display.sportLevel || game.sportLabel || `${publication.identity.shortName} Sports`,
    authorKey: toSearchFacetValue(game.display.sportLevel || game.sportLabel || `${publication.identity.shortName} Sports`),
    date: game.display.date || game.startDate,
    sortDate: game.startDate,
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
      <SearchPageClient items={items} publicationName={publication.identity.shortName} searchGapEndpoint={getBylineRestUrl("search-gaps")} />
    </main>
  );
}
