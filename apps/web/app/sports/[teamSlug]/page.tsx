import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamHubView } from "@/components/SportsArchiveViews";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getSportsArchiveData, getTeamMediaForSummary } from "@/lib/sports-data";
import { getPublicationConfig } from "@/lib/publication";
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

export async function generateStaticParams() {
  if (!publication.features.sports) return [{ teamSlug: "disabled" }];
  const teams = await getTeams();

  return teams.map((team) => ({
    teamSlug: team.slug
  }));
}

export async function generateMetadata({ params }: TeamPageProps): Promise<Metadata> {
  const { teamSlug } = await params;
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
