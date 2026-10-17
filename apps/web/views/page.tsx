import type { Metadata } from "@/lib/metadata";
import { HomepagePackages, ThisWeekCard as SharedThisWeekCard, packageHeadingId } from "@byline/ui";
import { HomepageHeroRailLimiter } from "@/components/HomepageHeroRailLimiter";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { optionalBuildData } from "@/lib/build-data";
import { filterPublicHomepagePosts } from "@/lib/content";
import {
  getSchoolEvents,
  type SchoolEvent
} from "@/lib/headless";
import { getHomeDesignDocument } from "@/lib/homepage-design";
import {
  getHomepageDataRequirements,
  resolveHomepageDocument
} from "@/lib/homepage-resolution";
import { toCalendarEntries } from "@/lib/homepage-packages";
import { getPublicationConfig } from "@/lib/publication";
import { buildPageMetadata, getHomepageTitle, getOrganizationSchema, getWebsiteSchema, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getAllPosts, getAllPublicCoverages } from "@/lib/wordpress";

const publication = getPublicationConfig();
export const metadata: Metadata = buildPageMetadata({
  title: getHomepageTitle(),
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: "/"
});

// Preserve the established sports/calendar request sizes.
const BASELINE_SCHOOL_EVENTS = 12;

async function getHomepageSportsSchedule(requirements: ReturnType<typeof getHomepageDataRequirements>) {
  if (!publication.features.sports && !publication.features.events) {
    return { recentScores: [], upcomingGames: [], schoolEvents: [] };
  }

  const [recentScores, upcomingGames, schoolEvents] = await Promise.all([
    [],
    [],
    publication.features.events
      ? getSchoolEvents(Math.max(BASELINE_SCHOOL_EVENTS, requirements.schoolEvents)).catch((): SchoolEvent[] => [])
      : []
  ]);

  return { recentScores, upcomingGames, schoolEvents };
}

export default async function HomePage() {
  const data = await getHomepagePageData();
  const { resolvedHome, sportsSchedule, websiteSchema, organizationSchema } = data;
  return (
    <main className="byline-publication-preview live-home-shell" data-theme={publication.appearance.theme}>
      <script id="organization-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema) }} />
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
  const organizationSchema = getOrganizationSchema();
  const posts = filterPublicHomepagePosts(allPosts);

  const resolvedHome = resolveHomepageDocument({
    document: homeDesign,
    posts,
    coverages,
    publication,
    sportsSchedule
  });

  return { resolvedHome, sportsSchedule, websiteSchema, organizationSchema };
}
