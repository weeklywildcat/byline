import { describe, expect, it } from "vitest";
import type { SportsGame, SportsRoster, SportsTeamMedia } from "@/lib/headless";
import {
  buildTeams,
  calculateRecord,
  getRelatedSportsCoverage,
  getTeamSeasonRoster,
  normalizeSportsSeason
} from "@/lib/sports";
import { getSeasonFromDate } from "@/lib/sports-season";
import { game, post } from "./fixtures/sports-fixture";

const emptyImage = {
  id: 0,
  url: "",
  alt: "",
  width: null,
  height: null
};

function teamRecord(
  key: string,
  displayName: string,
  options: { slug?: string; active?: boolean } = {}
): SportsTeamMedia {
  return {
    id: key,
    key,
    teamKey: key,
    sport: "Football",
    level: key.endsWith("-jv") ? "JV" : "Varsity",
    teamLabel: displayName,
    label: displayName,
    displayName,
    shortName: displayName,
    scoreboardName: displayName,
    slug: options.slug ?? key,
    active: options.active ?? true,
    headerImage: emptyImage,
    logo: emptyImage,
    accentColor: ""
  };
}

function roster(teamKey: string, season: string, id: number): SportsRoster {
  return {
    id,
    teamKey,
    season,
    teamSlug: teamKey,
    status: "publish",
    team: {
      key: teamKey,
      teamKey,
      slug: teamKey,
      displayName: teamKey,
      sport: "Football",
      level: "Varsity",
      teamLabel: teamKey,
      label: teamKey
    },
    players: [
      { id: "ath_returning", name: "Jordan Lee", number: "7", position: "QB", grade: "12" },
      { id: "ath_duplicate_name", name: "Jordan Lee", number: "21", position: "WR", grade: "10" }
    ],
    staff: []
  };
}

describe("canonical sports team and season model", () => {
  it("normalizes school years and derives them from the shared July boundary", () => {
    expect(normalizeSportsSeason("2026-27")).toBe("2026-27");
    expect(normalizeSportsSeason("2026/2027")).toBe("2026-27");
    expect(normalizeSportsSeason("2026-28")).toBe("");
    expect(normalizeSportsSeason("2026")).toBe("");
    expect(getSeasonFromDate("2026-06-30T23:59:00")).toBe("2025-26");
    expect(getSeasonFromDate("2026-07-01T00:00:00")).toBe("2026-27");
  });

  it("keeps varsity and junior-varsity records distinct by stable team key", () => {
    const varsityGame = game(1001, "football-varsity");
    const juniorVarsityGame = game(1002, "football-jv");
    const teams = buildTeams(
      [varsityGame, juniorVarsityGame],
      [],
      [
        teamRecord("football-varsity", "Football Varsity", { slug: "football-varsity" }),
        teamRecord("football-jv", "Football JV", { slug: "football-jv" })
      ]
    );

    expect(teams.map((team) => team.teamKey)).toEqual(["football-jv", "football-varsity"]);
    expect(teams.map((team) => team.name)).toEqual(["Football JV", "Football Varsity"]);
    expect(teams.every((team) => team.seasons.length > 0)).toBe(true);
    expect(teams.find((team) => team.teamKey === "football-jv")?.games).toHaveLength(1);
    expect(teams.find((team) => team.teamKey === "football-varsity")?.games).toHaveLength(1);
  });

  it("unions game and roster seasons and preserves inactive historical teams", () => {
    const teams = buildTeams(
      [game(1101, "soccer-varsity")],
      [roster("soccer-varsity", "2024/2025", 1102), roster("track-varsity", "2023-24", 1103)],
      [
        teamRecord("soccer-varsity", "Soccer Varsity", { slug: "soccer-varsity" }),
        teamRecord("track-varsity", "Track Varsity", { slug: "track-varsity", active: false })
      ]
    );
    const soccer = teams.find((team) => team.teamKey === "soccer-varsity");
    const track = teams.find((team) => team.teamKey === "track-varsity");

    expect(soccer?.seasons).toEqual(["2026-27", "2024-25"]);
    expect(track?.seasons).toEqual(["2023-24"]);
    expect(track?.active).toBe(false);
  });

  it("builds a current empty hub from canonical team data without requiring a game", () => {
    const configuredTeam = teamRecord("girls-lacrosse-varsity", "Girls Lacrosse - Varsity", { slug: "girls-lacrosse-varsity" });
    configuredTeam.currentSeason = "2026-27";
    const teams = buildTeams([], [], [configuredTeam]);

    expect(teams).toHaveLength(1);
    expect(teams[0]).toMatchObject({
      teamKey: "girls-lacrosse-varsity",
      slug: "girls-lacrosse-varsity",
      name: "Girls Lacrosse - Varsity",
      latestSeason: "2026-27",
      seasons: ["2026-27"],
      games: [],
      rosters: []
    });
  });

  it("does not expose an ambiguous roster when a team-season has duplicate records", () => {
    const team = buildTeams(
      [],
      [roster("baseball-varsity", "2025-26", 1201), roster("baseball-varsity", "2025/2026", 1202)],
      [teamRecord("baseball-varsity", "Baseball Varsity")]
    )[0];

    expect(team).toBeDefined();
    expect(getTeamSeasonRoster(team, "2025-26")).toBeNull();
  });

  it("keeps explicit article coverage scoped to selected games", () => {
    const selectedGame = game(1301, "volleyball-varsity");
    const unrelatedGame = game(1302, "volleyball-varsity");
    const team = buildTeams(
      [selectedGame, unrelatedGame],
      [],
      [teamRecord("volleyball-varsity", "Volleyball Varsity")]
    )[0];
    const explicitlyLinked = post(1303, "news");
    explicitlyLinked.byline = { primaryGameId: selectedGame.id };
    const fuzzyOnly = post(1304, "sports", { title: "Volleyball Varsity vs Rivals 1302" });
    const unrelatedExplicit = post(1305, "news");
    unrelatedExplicit.byline = { primaryGameId: unrelatedGame.id };

    expect(
      getRelatedSportsCoverage({
        posts: [explicitlyLinked, fuzzyOnly, unrelatedExplicit],
        team,
        games: [selectedGame],
        year: "2026/2027"
      }).map((entry) => entry.id)
    ).toEqual([explicitlyLinked.id]);
  });

  it("counts explicit ties as ties while leaving forfeits without a fabricated score", () => {
    const tie = game(1401, "soccer-varsity", { status: "tie", teamScore: 1, opponentScore: 1 });
    const win = game(1402, "soccer-varsity", { teamScore: 2, opponentScore: 0 });

    expect(calculateRecord([tie, win])).toEqual({ wins: 1, losses: 0, ties: 1, finalsCounted: 2 });
  });
});
