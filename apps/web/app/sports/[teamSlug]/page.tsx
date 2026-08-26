import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamHubView } from "@/components/SportsArchiveViews";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getSportsArchiveData, getTeamMediaForSummary } from "@/lib/sports-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import {
  getRelatedSportsCoverage,
  getSeasonByTeamAndYear,
  getTeamBySlug,
  getTeamHubHref
} from "@/lib/sports";

type TeamPageProps = {
  params: Promise<{
    teamSlug: string;
  }>;
};

export const dynamicParams = false;
const publication = getPublicationConfig();

async function getTeams() {
  return (await getSportsArchiveData()).teams;
}

// See the season route: the placeholder covers "sports off" and "sports on but
// no games yet". A sports API failure throws instead of building a fake route.
export async function generateStaticParams() {
  const placeholder = { teamSlug: BYLINE_EMPTY_ROUTE_SLUG };

  if (!publication.features.sports) return [placeholder];

  const teams = await getTeams();

  return withEmptyRouteFallback(
    teams.map((team) => ({
      teamSlug: team.slug
    })),
    placeholder
  );
}

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { teamSlug } = await params;

  if (isBylineEmptyRouteSlug(teamSlug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const team = getTeamBySlug(await getTeams(), teamSlug);

  if (!team) {
    return {};
  }

  return buildPageMetadata({
    title: `${team.name} Sports Hub`,
    description: `Scores, schedules, rosters, season archives and ${publication.identity.shortName} coverage for ${team.name}.`,
    path: getTeamHubHref(team)
  });
}

export default async function TeamPage({ params }: TeamPageProps) {
  if (!publication.features.sports) notFound();
  const { teamSlug } = await params;

  if (isBylineEmptyRouteSlug(teamSlug)) notFound();

  const { teams, teamMediaByKey, visiblePosts } = await getSportsArchiveData();
  const team = getTeamBySlug(teams, teamSlug);

  if (!team) {
    notFound();
  }

  const season = getSeasonByTeamAndYear(teams, team.slug, team.latestSeason);

  if (!season) {
    notFound();
  }

  const coverage = getRelatedSportsCoverage({
    posts: visiblePosts,
    team,
    games: season.games,
    year: season.year
  });
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Sports", path: "/sports/" },
    { name: team.name, path: getTeamHubHref(team) }
  ]);

  return (
    <main className="sports-archive-shell">
      <script
        id="team-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <TeamHubView team={team} season={season} teamMedia={getTeamMediaForSummary(team, teamMediaByKey)} coverage={coverage} />
    </main>
  );
}
