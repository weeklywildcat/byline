import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonArchiveView } from "@/components/SportsArchiveViews";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getSportsArchiveData, getTeamMediaForSummary } from "@/lib/sports-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import {
  getRelatedSportsCoverage,
  getSeasonByTeamAndYear,
  getSeasonHref,
  getTeamHubHref
} from "@/lib/sports";

type SeasonPageProps = {
  params: Promise<{
    teamSlug: string;
    year: string;
  }>;
};

export const dynamicParams = false;
const publication = getPublicationConfig();

async function getTeams() {
  return (await getSportsArchiveData()).teams;
}

// A sports-disabled publication, and a sports-enabled publication with no games
// yet, both build a single reserved placeholder route that renders notFound().
// A failure to reach the sports API is not handled here: getTeams() throws a
// BylineBuildDataError so the build stops with the failing endpoint named.
export async function generateStaticParams() {
  const placeholder = { teamSlug: BYLINE_EMPTY_ROUTE_SLUG, year: BYLINE_EMPTY_ROUTE_SLUG };

  if (!publication.features.sports) return [placeholder];

  const teams = await getTeams();

  return withEmptyRouteFallback(
    teams.flatMap((team) =>
      team.seasons.map((year) => ({
        teamSlug: team.slug,
        year
      }))
    ),
    placeholder
  );
}

export async function generateMetadata({ params }: SeasonPageProps): Promise<Metadata> {
  const { teamSlug, year } = await params;

  if (isBylineEmptyRouteSlug(teamSlug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const season = getSeasonByTeamAndYear(await getTeams(), teamSlug, year);

  if (!season) {
    return {};
  }

  return buildPageMetadata({
    title: `${season.team.name} ${season.year} Season`,
    description: `${season.year} ${season.team.name} schedule, roster, scores, results and related ${publication.identity.shortName} coverage.`,
    path: getSeasonHref(season.team, season.year)
  });
}

export default async function SeasonPage({ params }: SeasonPageProps) {
  if (!publication.features.sports) notFound();
  const { teamSlug, year } = await params;

  if (isBylineEmptyRouteSlug(teamSlug)) notFound();

  const { teams, teamMediaByKey, visiblePosts } = await getSportsArchiveData();
  const season = getSeasonByTeamAndYear(teams, teamSlug, year);

  if (!season) {
    notFound();
  }

  const coverage = getRelatedSportsCoverage({
    posts: visiblePosts,
    team: season.team,
    games: season.games,
    year: season.year
  });
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Sports", path: "/sports/" },
    { name: season.team.name, path: getTeamHubHref(season.team) },
    { name: season.year, path: getSeasonHref(season.team, season.year) }
  ]);

  return (
    <main className="sports-archive-shell">
      <script
        id="season-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SeasonArchiveView season={season} teamMedia={getTeamMediaForSummary(season.team, teamMediaByKey)} coverage={coverage} />
    </main>
  );
}
