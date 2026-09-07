import type { Metadata } from "@/lib/metadata";
import { HomepagePackages, ThisWeekCard as SharedThisWeekCard, packageHeadingId } from "@byline/ui";
import { DesignHomepage } from "@/components/DesignHomepage";
import { HomepageHeroRailLimiter } from "@/components/HomepageHeroRailLimiter";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { optionalBuildData } from "@/lib/build-data";
import { filterPublicHomepagePosts } from "@/lib/content";
import {
  getRecentSportsGames,
  getSchoolEvents,
  getUpcomingSportsGames,
  type SchoolEvent,
  type SportsGame
} from "@/lib/headless";
import { getHomeDesignDocument } from "@/lib/homepage-design";
import {
  getHomepageDataRequirements,
  resolveHomepageDocument
} from "@/lib/homepage-resolution";
import { getPublishedDesign } from "@/lib/designs";
import { resolvePublishedDesignBlocks } from "@/lib/design-resolution";
import { toCalendarEntries } from "@/lib/homepage-packages";
import { getPublicationConfig } from "@/lib/publication";
import { buildPageMetadata, getWebsiteSchema, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getAllPosts, getAllPublicCoverages } from "@/lib/wordpress";

const publication = getPublicationConfig();
export const metadata: Metadata = buildPageMetadata({
  title: publication.seo.defaultTitle,
  description: SITE_DESCRIPTION,
  path: "/"
});

// The pre-Studio homepage fetched a fixed 3 recent games and 8 upcoming ones and
// then sliced them down to what it rendered. Now that those counts are editorial
// settings, the fetch has to be at least as large as the package asks for --
// while never dropping below the original sizes, so the request stays identical
// at the default configuration and the This Week calendar, which is fed from the
// same upcoming list, keeps exactly the entries it had.
const BASELINE_RECENT_GAMES = 3;
const BASELINE_UPCOMING_GAMES = 8;
const BASELINE_SCHOOL_EVENTS = 12;

async function getHomepageSportsSchedule(requirements: ReturnType<typeof getHomepageDataRequirements>) {
  if (!publication.features.sports && !publication.features.events) {
    return { recentScores: [], upcomingGames: [], schoolEvents: [] };
  }

  const recentLimit = Math.max(BASELINE_RECENT_GAMES, requirements.recentScores);
  const upcomingLimit = Math.max(BASELINE_UPCOMING_GAMES, requirements.upcomingGames);

  const [recentScores, upcomingGames, schoolEvents] = await Promise.all([
    publication.features.sports ? getRecentSportsGames(recentLimit).catch((): SportsGame[] => []) : [],
    publication.features.sports ? getUpcomingSportsGames(upcomingLimit).catch((): SportsGame[] => []) : [],
    publication.features.events
      ? getSchoolEvents(Math.max(BASELINE_SCHOOL_EVENTS, requirements.schoolEvents)).catch((): SchoolEvent[] => [])
      : []
  ]);

  return { recentScores, upcomingGames, schoolEvents };
}

export default async function HomePage() {
  const data = await getHomepagePageData();
  if (data.mode === "v1") {
    return (
      <>
        <script id="website-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data.websiteSchema) }} />
        <DesignHomepage blocks={data.designBlocks} sportsSchedule={data.sportsSchedule} theme={publication.appearance.theme} />
      </>
    );
  }
  const { resolvedHome, sportsSchedule, websiteSchema } = data;
  return (
    <main className="byline-publication-preview live-home-shell" data-theme={publication.appearance.theme}>
      <script id="website-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }} />
      <HomepagePackages
        packages={resolvedHome.packages}
        theme={publication.appearance.theme}
        slots={{
          railLimiter: <HomepageHeroRailLimiter />,
          poll: ({ packageId }) => <PollWidget headingId={packageHeadingId(`${packageId}-poll`, "homepage-poll-heading")} inputName={`${packageId}-poll`} />,
          calendar: ({ package: resolvedPackage, packageId }) => "latest" in resolvedPackage ? <SharedThisWeekCard entries={toCalendarEntries(sportsSchedule.schoolEvents, sportsSchedule.upcomingGames, resolvedPackage.utility.calendarLimit ?? 3)} heading={resolvedPackage.utility.calendarHeading ?? "At NSHS"} scheduleHref="/sports/schedule/" headingId={packageHeadingId(`${packageId}-calendar`, "this-week-heading")} /> : null,
          newsletter: ({ package: resolvedPackage, packageId }) => "label" in resolvedPackage ? <NewsletterSignupForm headingId={packageHeadingId(`${packageId}-heading`, "article-newsletter-heading")} heading={resolvedPackage.heading} showLabel={resolvedPackage.presentation.showLabel} /> : null
        }}
      />
    </main>
  );
}

export async function getHomepagePageData() {
  const homeDesign = getHomeDesignDocument();
  const requirements = getHomepageDataRequirements(homeDesign);
  const [allPosts, coverages, sportsSchedule] = await Promise.all([
    getAllPosts(),
    optionalBuildData("/wp-json/byline/v1/coverage", getAllPublicCoverages, []),
    getHomepageSportsSchedule(requirements)
  ]);
  const websiteSchema = getWebsiteSchema();
  const posts = filterPublicHomepagePosts(allPosts);

  const publishedHomeDesign = getPublishedDesign("home");

  // Keep the old whole-page renderer live for a published v1 document while
  // the migration/parity proof is being completed. In particular, divider is
  // visible output in DesignHomepage, so a migrated v1 document containing it
  // must not silently render without that rule. Schema-v2 documents always use
  // the package orchestrator below.
  if (publishedHomeDesign && publishedHomeDesign.revision > 0 && publishedHomeDesign.schemaVersion === 1) {
    const designBlocks = await resolvePublishedDesignBlocks(publishedHomeDesign.document.layout.content, posts);

    return { mode: "v1" as const, designBlocks, sportsSchedule, websiteSchema };
  }

  const resolvedHome = resolveHomepageDocument({
    document: homeDesign,
    posts,
    coverages,
    publication,
    sportsSchedule
  });

  return { mode: "v2" as const, resolvedHome, sportsSchedule, websiteSchema };
}
