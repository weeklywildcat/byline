import { filterVisibleContentPosts } from "@/lib/content";
import { getAllSportsGames, getAllSportsRosters, getSportsTeams, type SportsGame, type SportsRoster, type SportsTeamMedia } from "@/lib/headless";
import { buildTeams, type TeamSummary } from "@/lib/sports";
import { getAllPosts, type WordPressPost } from "@/lib/wordpress";

type SportsArchiveData = {
  games: SportsGame[];
  rosters: SportsRoster[];
  teams: TeamSummary[];
  teamMedia: SportsTeamMedia[];
  teamMediaByKey: Map<string, SportsTeamMedia>;
  posts: WordPressPost[];
  visiblePosts: WordPressPost[];
};

let sportsArchiveDataPromise: Promise<SportsArchiveData> | null = null;

// Static sports pages all derive from the same canonical game and roster records,
// team media settings, and WordPress posts. This shared loader reduces repeated live CMS work
// during local development and static export generation.
export function getSportsArchiveData() {
  sportsArchiveDataPromise ??= Promise.all([
    getAllSportsGames().catch(() => []),
    getAllSportsRosters().catch(() => []),
    getSportsTeams().catch(() => []),
    getAllPosts()
  ]).then(([games, rosters, teamMedia, posts]) => {
    const teamMediaByKey = new Map(teamMedia.map((team) => [team.key, team]));

    return {
      games,
      rosters,
      teams: buildTeams(games, rosters),
      teamMedia,
      teamMediaByKey,
      posts,
      visiblePosts: filterVisibleContentPosts(posts)
    };
  });

  return sportsArchiveDataPromise;
}

export function getTeamMediaForSummary(team: Pick<TeamSummary, "sportKeys">, teamMediaByKey: Map<string, SportsTeamMedia>) {
  return team.sportKeys.map((key) => teamMediaByKey.get(key)).find(Boolean) ?? null;
}
