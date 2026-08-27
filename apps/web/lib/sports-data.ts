import { requireBuildData } from "@/lib/build-data";
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
  // These are required build inputs. A failure here previously became `[]`, which
  // surfaced later as an unhelpful "generateStaticParams() returned an empty
  // array" on whichever sports route happened to build first. Each request is now
  // attributed to its endpoint so a build log names the thing that actually broke.
  sportsArchiveDataPromise ??= Promise.all([
    requireBuildData("/wp-json/weekly-wildcat/v1/sports-games", getAllSportsGames),
    requireBuildData("/wp-json/weekly-wildcat/v1/sports-rosters", getAllSportsRosters),
    requireBuildData("/wp-json/weekly-wildcat/v1/sports-teams", getSportsTeams),
    requireBuildData("/wp-json/wp/v2/posts", getAllPosts)
  ]).then(([games, rosters, teamMedia, posts]) => {
    const teamMediaByKey = new Map(teamMedia.map((team) => [team.teamKey || team.key, team]));

    return {
      games,
      rosters,
      teams: buildTeams(games, rosters, teamMedia),
      teamMedia,
      teamMediaByKey,
      posts,
      visiblePosts: filterVisibleContentPosts(posts)
    };
  });

  return sportsArchiveDataPromise;
}

export function getTeamMediaForSummary(team: Pick<TeamSummary, "teamKey" | "sportKeys">, teamMediaByKey: Map<string, SportsTeamMedia>) {
  return teamMediaByKey.get(team.teamKey) ?? team.sportKeys.map((key) => teamMediaByKey.get(key)).find(Boolean) ?? null;
}
