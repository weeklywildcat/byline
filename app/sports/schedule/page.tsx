import type { Metadata } from "next";
import { SportsScheduleArchive } from "@/components/SportsScheduleArchive";
import { getSportsGames } from "@/lib/headless";

export const metadata: Metadata = {
  title: "Game History & Schedule",
  description: "Previous scores and upcoming games for Weekly Wildcat sports coverage."
};

export default async function SportsSchedulePage() {
  const games = await getSportsGames(100).catch(() => []);

  return (
    <main className="schedule-page-shell">
      <SportsScheduleArchive games={games} />
    </main>
  );
}
