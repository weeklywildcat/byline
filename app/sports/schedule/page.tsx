import type { Metadata } from "next";
import { SportsScheduleArchive } from "@/components/SportsScheduleArchive";
import { getSportsGameFacets, getSportsGames, type SportsGame, type SportsGameFacets } from "@/lib/headless";
import { buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getWordPressApiUrl } from "@/lib/wordpress";

const INITIAL_SCHEDULE_LIMIT = 25;
const DEFAULT_RAW_DATA_LIMIT = 5000;

type ScheduleSummary = {
  games: number;
  upcoming: number;
  finals: number;
  wins: number;
  losses: number;
  ties: number;
};

function getYear(game: SportsGame) {
  return game.startDate.slice(0, 4);
}

function getSportLabel(game: SportsGame) {
  return game.sport || game.sportLabel || game.sportKey || "Sports";
}

function getSportValue(game: SportsGame) {
  return game.sportKey || getSportLabel(game);
}

function getSummaryKey(year = "all", sport = "all") {
  return `${year}::${sport}`;
}

function createSummary(): ScheduleSummary {
  return {
    games: 0,
    upcoming: 0,
    finals: 0,
    wins: 0,
    losses: 0,
    ties: 0
  };
}

function addGameToSummary(summary: ScheduleSummary, game: SportsGame) {
  summary.games += 1;

  if (game.status === "upcoming") {
    summary.upcoming += 1;
  }

  if (game.status === "final") {
    summary.finals += 1;

    if (game.wildcatsScore !== null && game.opponentScore !== null) {
      if (game.wildcatsScore > game.opponentScore) {
        summary.wins += 1;
      } else if (game.wildcatsScore < game.opponentScore) {
        summary.losses += 1;
      } else {
        summary.ties += 1;
      }
    }
  }
}

function buildScheduleMetadata(games: SportsGame[]) {
  const yearSet = new Set<string>();
  const sportMap = new Map<string, string>();
  const summaries: Record<string, ScheduleSummary> = {};

  games.forEach((game) => {
    const year = getYear(game);
    const sport = getSportValue(game);

    if (year) {
      yearSet.add(year);
    }

    if (sport) {
      sportMap.set(sport, getSportLabel(game));
    }

    [
      getSummaryKey(),
      getSummaryKey(year || "all", "all"),
      getSummaryKey("all", sport || "all"),
      getSummaryKey(year || "all", sport || "all")
    ].forEach((key) => {
      summaries[key] ??= createSummary();
      addGameToSummary(summaries[key], game);
    });
  });

  return {
    years: [...yearSet].sort((left, right) => right.localeCompare(left)),
    sports: [...sportMap.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    summaries
  };
}

function getSportsDataUrl(limit = DEFAULT_RAW_DATA_LIMIT) {
  const gameLimit = Math.max(limit, INITIAL_SCHEDULE_LIMIT);

  return `${getWordPressApiUrl().replace(/\/wp\/v2$/, "/weekly-wildcat/v1/sports-games")}?per_page=${gameLimit}&page=1`;
}

async function getScheduleFacets(fallbackGames: SportsGame[]): Promise<SportsGameFacets> {
  try {
    return await getSportsGameFacets();
  } catch {
    return {
      ...buildScheduleMetadata(fallbackGames),
      dataUrl: getSportsDataUrl()
    };
  }
}

const pageMetadata = buildPageMetadata({
  title: "Game History & Schedule",
  description: "Previous scores and upcoming games for Weekly Wildcat sports coverage.",
  path: "/sports/schedule/"
});

export const metadata: Metadata = {
  ...pageMetadata,
  alternates: {
    ...pageMetadata.alternates,
    types: {
      "application/json": getSportsDataUrl()
    }
  }
};

export default async function SportsSchedulePage() {
  const initialGames = await getSportsGames(INITIAL_SCHEDULE_LIMIT).catch(() => []);
  const scheduleMetadata = await getScheduleFacets(initialGames);
  const rawDataLimit = Math.max(scheduleMetadata.summaries[getSummaryKey()]?.games ?? 0, DEFAULT_RAW_DATA_LIMIT);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Sports", path: "/sports/" },
    { name: "Game History & Schedule", path: "/sports/schedule/" }
  ]);

  return (
    <main className="schedule-page-shell">
      <script
        id="sports-schedule-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <SportsScheduleArchive
        apiBaseUrl={getWordPressApiUrl()}
        dataUrl={getSportsDataUrl(rawDataLimit)}
        games={initialGames}
        sports={scheduleMetadata.sports}
        summaries={scheduleMetadata.summaries}
        years={scheduleMetadata.years}
      />
    </main>
  );
}
