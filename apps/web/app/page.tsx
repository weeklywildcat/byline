import type { Metadata } from "next";
import { LeadPackage, ThisWeekCard as SharedThisWeekCard } from "@byline/ui";
import { HomepageHeroRailLimiter } from "@/components/HomepageHeroRailLimiter";
import { DesignHomepage } from "@/components/DesignHomepage";
import { HomepageStory } from "@/components/HomepageStory";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { SiteIcon } from "@/components/SiteIcon";
import { SportsAthleteFeature } from "@/components/SportsAthleteFeature";
import { SportsSchedulePanel } from "@/components/SportsSchedulePanel";
import { ThisWeekCard } from "@/components/ThisWeekCard";
import { filterPublicHomepagePosts } from "@/lib/content";
import {
  getRecentSportsGames,
  getSchoolEvents,
  getUpcomingSportsGames,
  type SchoolEvent,
  type SportsGame
} from "@/lib/headless";
import { getHomeDesignDocument, findLeadPackage } from "@/lib/homepage-design";
import {
  resolveCompatibilityHomepageSelection,
  resolveLeadPackage,
  toCalendarEntries
} from "@/lib/homepage-packages";
import { getPublishedDesign } from "@/lib/designs";
import { resolvePublishedDesignBlocks } from "@/lib/design-resolution";
import { getPublicationConfig } from "@/lib/publication";
import { buildPageMetadata, getWebsiteSchema, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getAllPosts, getPostSettings } from "@/lib/wordpress";

const publication = getPublicationConfig();
const socialIcons: Record<string, string> = {
  facebook: "ph:facebook-logo",
  instagram: "ph:instagram-logo",
  linkedin: "ph:linkedin-logo",
  tiktok: "ph:tiktok-logo",
  youtube: "ph:youtube-logo"
};

export const metadata: Metadata = buildPageMetadata({
  title: publication.seo.defaultTitle,
  description: SITE_DESCRIPTION,
  path: "/"
});

async function getHomepageSportsSchedule() {
  if (!publication.features.sports && !publication.features.events) {
    return { recentScores: [], upcomingGames: [], schoolEvents: [] };
  }

  const [recentScores, upcomingGames, schoolEvents] = await Promise.all([
    publication.features.sports ? getRecentSportsGames(3).catch((): SportsGame[] => []) : [],
    publication.features.sports ? getUpcomingSportsGames(8).catch((): SportsGame[] => []) : [],
    publication.features.events ? getSchoolEvents(12).catch((): SchoolEvent[] => []) : []
  ]);

  return { recentScores, upcomingGames, schoolEvents };
}

export default async function HomePage() {
  const [allPosts, sportsSchedule] = await Promise.all([getAllPosts(), getHomepageSportsSchedule()]);
  const websiteSchema = getWebsiteSchema();
  const posts = filterPublicHomepagePosts(allPosts);
  const publishedHomeDesign = getPublishedDesign("home");

  // The whole-page schema 1 renderer. It only runs for a published *v1* design,
  // which is the pre-package world; a v2 design drives the package path below.
  // This is removed once every package has been extracted.
  if (publishedHomeDesign && publishedHomeDesign.revision > 0 && publishedHomeDesign.schemaVersion === 1) {
    const designBlocks = await resolvePublishedDesignBlocks(publishedHomeDesign.document.layout.content, posts);
    return (
      <>
        <script
          id="website-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
        />
        <DesignHomepage blocks={designBlocks} sportsSchedule={sportsSchedule} />
      </>
    );
  }

  const selection = resolveCompatibilityHomepageSelection(posts);
  const {
    athleteSpotlightPost,
    leadPost,
    inFocusPost,
    specialCoveragePosts,
    opinionPosts,
    fieldPosts,
    morePosts,
    briefPosts
  } = selection;
  const opinionLeadPost = opinionPosts[0] ?? null;
  const opinionRailPosts = opinionPosts.slice(1, 3);
  const fieldLeadPost = fieldPosts[0] ?? null;
  const fieldRailPosts = fieldPosts.slice(1, 3);
  const moreLeadPost = morePosts[0] ?? null;
  const moreRailPosts = morePosts.slice(1, 4);
  const briefLeadPost = briefPosts[0] ?? null;
  const briefRailPosts = briefPosts.slice(1);
  const hasFieldSection =
    publication.features.sports &&
    (fieldPosts.length > 0 ||
      Boolean(athleteSpotlightPost) ||
      sportsSchedule.recentScores.length > 0 ||
      sportsSchedule.upcomingGames.length > 0);
  const leadHasOpinionTreatment = Boolean(leadPost && getPostSettings(leadPost)?.homepageOpinionTreatment);

  // The lead package is resolved from the design document. It consumes the same
  // ordered selection the legacy sections below use, so extracting it cannot
  // change which stories any other package receives.
  const homeDesign = getHomeDesignDocument();
  const leadPackage = findLeadPackage(homeDesign);
  const resolvedLead = resolveLeadPackage({
    packageId: leadPackage?.id ?? "home-lead",
    props: leadPackage?.props ?? {},
    posts,
    selection,
    features: {
      polls: publication.features.polls,
      events: publication.features.events,
      sports: publication.features.sports
    }
  });
  const leadCalendarLimit = resolvedLead.utility.calendar ? 3 : 0;

  return (
    <main className={leadHasOpinionTreatment ? "live-home-shell live-home-shell-opinion-lead" : "live-home-shell"}>
      <script
        id="website-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
      />
      {/* Design-driven: the lead package now renders through the shared
          renderer that Studio also uses. The sections below are still legacy
          and will be extracted in later phases. */}
      <LeadPackage
        package={resolvedLead}
        railLimiterSlot={<HomepageHeroRailLimiter />}
        pollSlot={<PollWidget />}
        calendarSlot={
          <SharedThisWeekCard
            entries={toCalendarEntries(sportsSchedule.schoolEvents, sportsSchedule.upcomingGames, leadCalendarLimit)}
            heading="At NSHS"
            scheduleHref="/sports/schedule/"
          />
        }
      />

      {briefPosts.length > 0 ? (
        <section className="the-brief" aria-labelledby="brief-heading">
          <h2 id="brief-heading">The Brief</h2>
          <div
            className={
              briefRailPosts.length > 0
                ? "brief-digest-layout"
                : "brief-digest-layout brief-digest-layout-single"
            }
          >
            {briefLeadPost ? (
              <HomepageStory post={briefLeadPost} variant="brief-lead" showAuthor showDeck />
            ) : null}
            {briefRailPosts.length > 0 ? (
              <div className="brief-support-list">
                {briefRailPosts.map((post) => (
                  <HomepageStory key={post.id} post={post} variant="row" showAuthor />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {inFocusPost ? (
        <section className="in-focus" aria-labelledby="focus-heading">
          <div className="live-package-label" id="focus-heading">
            In Focus
          </div>
          <HomepageStory post={inFocusPost} variant="focus" showAuthor showDeck />
        </section>
      ) : null}

      {specialCoveragePosts.length > 0 ? (
        <section className="special-coverage" aria-labelledby="special-coverage-heading">
          <div className="live-package-label" id="special-coverage-heading">
            Special Coverage
          </div>
          <div
            className={
              specialCoveragePosts.length > 1
                ? "special-coverage-layout"
                : "special-coverage-layout special-coverage-layout-single"
            }
          >
            {specialCoveragePosts.map((post, index) => (
              <HomepageStory
                key={post.id}
                post={post}
                variant={index === 0 ? "special" : "briefing"}
                showAuthor={index === 0}
                showDeck={index === 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      {opinionLeadPost ? (
        <section className="opinion-package" aria-labelledby="opinion-heading">
          <div className="opinion-package-header">
            <div>
              <h2 id="opinion-heading">Opinion</h2>
              <p>Student perspectives, columns, and commentary from {publication.identity.shortName} writers.</p>
            </div>
            <a href="/category/opinion/">All Opinion →</a>
          </div>
          <div
            className={
              opinionRailPosts.length > 0
                ? "opinion-package-layout"
                : "opinion-package-layout opinion-package-layout-single"
            }
          >
            <HomepageStory post={opinionLeadPost} variant="opinion-lead" showAuthor showDeck />
            {opinionRailPosts.length > 0 ? (
              <div className="opinion-rail">
                {opinionRailPosts.map((post) => (
                  <HomepageStory key={post.id} post={post} variant="opinion" showAuthor showDeck />
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {hasFieldSection ? (
        <section className="from-field" aria-labelledby="field-heading">
          <div className="section-header-row">
            <h2 id="field-heading">Sports</h2>
            <a href="/sports/">All Sports →</a>
          </div>
          {fieldPosts.length > 0 || athleteSpotlightPost ? (
            <div className="field-layout">
              {fieldLeadPost ? (
                <HomepageStory
                  post={fieldLeadPost}
                  variant="field"
                  showDeck
                  cleanDeck
                  showAuthor
                  showReadLink
                />
              ) : null}
              {fieldRailPosts.length > 0 || athleteSpotlightPost ? (
                <div className="field-rail">
                  {fieldRailPosts.map((post) => (
                    <HomepageStory key={post.id} post={post} variant="briefing" showAuthor />
                  ))}
                  {athleteSpotlightPost ? <SportsAthleteFeature post={athleteSpotlightPost} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          <SportsSchedulePanel recentScores={sportsSchedule.recentScores} upcomingGames={sportsSchedule.upcomingGames} />
        </section>
      ) : null}

      {morePosts.length > 0 ? (
        <section className="more-weekly" aria-labelledby="more-heading">
          <div className="more-weekly-header">
            <h2 id="more-heading">More From {publication.identity.shortName}</h2>
            <span aria-hidden="true" />
            <a href="/stories/">View All Stories →</a>
          </div>

          <div className="more-weekly-layout">
            <div className="more-story-grid">
              {moreLeadPost ? (
                <HomepageStory post={moreLeadPost} variant="more-lead" showDeck cleanDeck />
              ) : null}
              {moreRailPosts.length > 0 ? (
                <div className="more-compact-list">
                  {moreRailPosts.map((post) => (
                    <HomepageStory key={post.id} post={post} variant="more-compact" showDeck cleanDeck />
                  ))}
                </div>
              ) : null}
            </div>

            <aside className="more-utility-rail" aria-label={`${publication.identity.name} links`}>
              <p className="more-rail-label">{publication.identity.shortName}</p>
              <div className="more-utility-block">
                <div className="more-utility-block-heading">
                  <SiteIcon name="ph:newspaper-clipping" width={18} height={18} />
                  <h3>Join the Staff</h3>
                </div>
                <p>Report games, photograph campus life, design pages, or help edit the next story package.</p>
                <div className="more-action-links">
                  <a href="/join/">
                    <SiteIcon name="ph:pencil-line" width={16} height={16} />
                    Join the newsroom
                  </a>
                  <a href="/authors/">
                    <SiteIcon name="ph:users-three" width={16} height={16} />
                    Meet the staff
                  </a>
                </div>
              </div>
              <div className="more-utility-block">
                <div className="more-utility-block-heading">
                  <SiteIcon name="ph:chat-circle-dots" width={18} height={18} />
                  <h3>Stay Connected</h3>
                </div>
                <p>Follow daily posts, send a tip, or bring {publication.identity.shortName} into your inbox.</p>
                <nav className="more-connect-links" aria-label="Stay connected">
                  {publication.social.map((social) => (
                    <a key={`${social.service}-${social.url}`} href={social.url} target="_blank" rel="noreferrer">
                      <SiteIcon name={socialIcons[social.service] ?? "ph:link"} width={17} height={17} />
                      {social.label}
                    </a>
                  ))}
                  <a href={publication.urls.contact}>
                    <SiteIcon name="ph:envelope-simple" width={17} height={17} />
                    Contact
                  </a>
                  {publication.features.newsletter ? (
                    <a href="#home-newsletter">
                      <SiteIcon name="ph:paper-plane-tilt" width={17} height={17} />
                      Newsletter
                    </a>
                  ) : null}
                </nav>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      {publication.features.newsletter ? (
        <section id="home-newsletter" className="home-newsletter-section" aria-label="Newsletter signup">
          <NewsletterSignupForm />
        </section>
      ) : null}
    </main>
  );
}
