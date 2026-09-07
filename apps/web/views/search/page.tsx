import type { Metadata } from "@/lib/metadata";
import { SearchPageClient, type SearchIndexItem } from "@/components/SearchPageClient";
import { getBuildSnapshot } from "@/lib/build-snapshot";
import { filterVisibleContentPosts, getPrimaryVisibleCategory, getPublicTopicTags } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { buildPageMetadata } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { getBylineRestUrl } from "@/lib/byline-rest";
import { toSearchFacetValue } from "@/lib/search";
import { getGameHref, getSeasonHref, getTeamHubHref } from "@/lib/sports";
import { getPostContributors, getPostHref } from "@/lib/wordpress";

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

export async function getSearchPageProps() {
  const snapshot = await getBuildSnapshot();
  const { posts, sports } = snapshot;
  const { games, teams } = sports;
  const visiblePosts = filterVisibleContentPosts(posts);
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
      sortDate: post.date
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
    searchTokens: [team.slug, team.shortName, ...team.sportKeys, ...team.seasons]
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
      searchTokens: [team.slug, team.shortName, "schedule", "scores", "results"]
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
    searchTokens: [
      String(game.id),
      game.sportKey,
      game.sport,
      game.level,
      game.teamLabel,
      game.opponent,
      game.site,
      game.locationName,
      game.locationAddress,
      game.startDate
    ].filter((value): value is string => Boolean(value))
  }));
  const items = [...teamItems, ...seasonItems, ...storyItems, ...gameItems];

  return {
    items,
    publicationName: publication.identity.shortName,
    searchGapEndpoint: getBylineRestUrl("search-gaps")
  };
}

export default async function SearchPage() {
  const { publicationName, searchGapEndpoint } = await getSearchPageProps();
  return (
    <main className="search-page-shell">
      <SearchPageClient publicationName={publicationName} searchGapEndpoint={searchGapEndpoint} />
    </main>
  );
}
