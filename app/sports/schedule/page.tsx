import type { Metadata } from "next";
import { SportsScheduleArchive } from "@/components/SportsScheduleArchive";
import { getSportsGames } from "@/lib/headless";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Game History & Schedule",
    description: "Previous scores and upcoming games for Weekly Wildcat sports coverage.",
    path: "/sports/schedule/"
  })
};

export default async function SportsSchedulePage() {
  const games = await getSportsGames(100).catch(() => []);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Sports", path: "/category/sports/" },
    { name: "Game History & Schedule", path: "/sports/schedule/" }
  ]);

  return (
    <main className="schedule-page-shell">
      <script
        id="sports-schedule-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SportsScheduleArchive games={games} />
    </main>
  );
}
