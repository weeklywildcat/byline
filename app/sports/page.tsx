import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SportsLandingView } from "@/components/SportsArchiveViews";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getSportsArchiveData } from "@/lib/sports-data";
import { getSportsCoverage, sortGamesAscending, sortGamesDescending } from "@/lib/sports";
import { getPublicationConfig } from "@/lib/publication";

export const dynamic = "force-static";
const publication = getPublicationConfig();

const pageMetadata = buildPageMetadata({
  title: "Sports",
  description: `${publication.identity.shortName} sports team hubs, season archives, scores, schedules and coverage.`,
  path: "/sports/"
});

export const metadata: Metadata = pageMetadata;

export default async function SportsPage() {
  if (!publication.features.sports) notFound();
  const { games, teams, teamMediaByKey, visiblePosts } = await getSportsArchiveData();
  const sportsCoverage = getSportsCoverage(visiblePosts).slice(0, 6);
  const upcomingGames = games.filter((game) => game.status === "upcoming").sort(sortGamesAscending).slice(0, 5);
  const recentScores = games
    .filter((game) => game.status === "final" && game.wildcatsScore !== null && game.opponentScore !== null)
    .sort(sortGamesDescending)
    .slice(0, 5);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Sports", path: "/sports/" }
  ]);

  return (
    <main className="sports-archive-shell">
      <script
        id="sports-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SportsLandingView
        teams={teams}
        teamMediaByKey={teamMediaByKey}
        upcomingGames={upcomingGames}
        recentScores={recentScores}
        latestCoverage={sportsCoverage}
      />
    </main>
  );
}
