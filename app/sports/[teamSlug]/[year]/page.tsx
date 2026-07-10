import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonArchiveView } from "@/components/SportsArchiveViews";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getSportsArchiveData, getTeamMediaForSummary } from "@/lib/sports-data";
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

async function getTeams() {
  return (await getSportsArchiveData()).teams;
}

export async function generateStaticParams() {
  const teams = await getTeams();

  return teams.flatMap((team) =>
    team.seasons.map((year) => ({
      teamSlug: team.slug,
      year
    }))
  );
}

export async function generateMetadata({ params }: SeasonPageProps): Promise<Metadata> {
  const { teamSlug, year } = await params;
  const season = getSeasonByTeamAndYear(await getTeams(), teamSlug, year);

  if (!season) {
    return {};
  }

  return buildPageMetadata({
    title: `${season.team.name} ${season.year} Season`,
    description: `${season.year} ${season.team.name} schedule, roster, scores, results and related Weekly Wildcat coverage.`,
    path: getSeasonHref(season.team, season.year)
  });
}

export default async function SeasonPage({ params }: SeasonPageProps) {
  const { teamSlug, year } = await params;
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
