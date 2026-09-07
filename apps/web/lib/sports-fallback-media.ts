import { deterministicMediaPath, MEDIA_CACHE_VERSION } from "@byline/content";

export const WEEKLY_WILDCAT_SOCCER_HERO_SOURCE =
  "https://cms.weeklywildcat.com/wp-content/uploads/2026/06/GirlsSoccerCelebration.jpeg";

export const WEEKLY_WILDCAT_SOCCER_HERO_PATH = deterministicMediaPath(
  WEEKLY_WILDCAT_SOCCER_HERO_SOURCE,
  MEDIA_CACHE_VERSION
);
