import type { Metadata } from "next";
import { LeadPackage, SportsPackage, ThisWeekCard as SharedThisWeekCard } from "@byline/ui";
import { HomepageHeroRailLimiter } from "@/components/HomepageHeroRailLimiter";
import { DesignHomepage } from "@/components/DesignHomepage";
import { HomepageStory } from "@/components/HomepageStory";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { SiteIcon } from "@/components/SiteIcon";
import { ThisWeekCard } from "@/components/ThisWeekCard";
import { collectPinnedStoryIds, parseSportsPackageProps, type SportsPackageProps } from "@byline/design";
import { filterPublicHomepagePosts } from "@/lib/content";
import {
  getRecentSportsGames,
  getSchoolEvents,
  getUpcomingSportsGames,
  type SchoolEvent,
  type SportsGame
} from "@/lib/headless";
import { getHomeDesignDocument, findLeadPackage, findSportsPackage } from "@/lib/homepage-design";
import {
  resolveCompatibilityHomepageSelection,
  resolveLeadPackage,
  toCalendarEntries
} from "@/lib/homepage-packages";
import { resolveSportsPackage } from "@/lib/sports-packages";
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

// The pre-Studio homepage fetched a fixed 3 recent games and 8 upcoming ones and
// then sliced them down to what it rendered. Now that those counts are editorial
// settings, the fetch has to be at least as large as the package asks for --
// while never dropping below the original sizes, so the request stays identical
// at the default configuration and the This Week calendar, which is fed from the
// same upcoming list, keeps exactly the entries it had.
const BASELINE_RECENT_GAMES = 3;
const BASELINE_UPCOMING_GAMES = 8;

async function getHomepageSportsSchedule(sports: SportsPackageProps) {
  if (!publication.features.sports && !publication.features.events) {
    return { recentScores: [], upcomingGames: [], schoolEvents: [] };
  }

  const recentLimit = Math.max(BASELINE_RECENT_GAMES, sports.scores.limit);
  const upcomingLimit = Math.max(BASELINE_UPCOMING_GAMES, sports.upcoming.limit);

  const [recentScores, upcomingGames, schoolEvents] = await Promise.all([
    publication.features.sports ? getRecentSportsGames(recentLimit).catch((): SportsGame[] => []) : [],
    publication.features.sports ? getUpcomingSportsGames(upcomingLimit).catch((): SportsGame[] => []) : [],
    publication.features.events ? getSchoolEvents(12).catch((): SchoolEvent[] => []) : []
  ]);

  return { recentScores, upcomingGames, schoolEvents };
}

export default async function HomePage() {
  // The design document is read before the content so the sports package's
  // configured counts can size the schedule request.
  const homeDesign = getHomeDesignDocument();
  const sportsPackage = findSportsPackage(homeDesign);
  const sportsConfig = parseSportsPackageProps(sportsPackage?.props ?? {});
  const [allPosts, sportsSchedule] = await Promise.all([
    getAllPosts(),
    getHomepageSportsSchedule(sportsConfig)
  ]);
  const websiteSchema = getWebsiteSchema();
  const posts = filterPublicHomepagePosts(allPosts);
  const publishedHomeDesign = getPublishedDesign("home");

  // Published schema 1 designs render here, through the legacy whole-page
  // renderer, and are deliberately NOT migrated on read: only story-lead has a
  // v2 equivalent today, so converting a live v1 homepage would silently drop
  // every other section. Studio migrates v1 on load; the published page does
  // not. A published v2 design takes the package path below.
  // This branch goes away once the remaining packages exist.
  if (publishedHomeDesign && publishedHomeDesign.revision > 0 && publishedHomeDesign.schemaVersion === 1) {
    const designBlocks = await resolvePublishedDesignBlocks(publishedHomeDesign.document.layout.content, posts);
    return (
      <>
        <script
          id="website-json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
        />
        <DesignHomepage
          blocks={designBlocks}
          sportsSchedule={sportsSchedule}
          theme={publication.appearance.theme}
        />
      </>
    );
  }

  // Stories an editor pinned are reserved before the ordered pass runs, so the
  // package that pinned them is the only one that can show them.
  const selection = resolveCompatibilityHomepageSelection(posts, collectPinnedStoryIds(homeDesign));
  // athleteSpotlightPost and fieldPosts are no longer destructured here: the
  // sports package consumes them through the resolver. They are still claimed by
  // the same ordered pass, in the same position, so the remaining legacy
  // sections receive exactly the stories they did before.
  const { leadPost, inFocusPost, specialCoveragePosts, opinionPosts, morePosts, briefPosts } = selection;
  const opinionLeadPost = opinionPosts[0] ?? null;
  const opinionRailPosts = opinionPosts.slice(1, 3);
  const moreLeadPost = morePosts[0] ?? null;
  const moreRailPosts = morePosts.slice(1, 4);
  const briefLeadPost = briefPosts[0] ?? null;
  const briefRailPosts = briefPosts.slice(1);
  const leadHasOpinionTreatment = Boolean(leadPost && getPostSettings(leadPost)?.homepageOpinionTreatment);

  // Both extracted packages are resolved from the design document. They consume
  // the same ordered selection the legacy sections below use, so extracting them
  // cannot change which stories any other package receives.
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
  const resolvedSports = resolveSportsPackage({
    packageId: sportsPackage?.id ?? "home-sports",
    props: sportsPackage?.props ?? {},
    posts,
    selection,
    recentScores: sportsSchedule.recentScores,
    upcomingGames: sportsSchedule.upcomingGames,
    features: { sports: publication.features.sports }
  });

  return (
    <main
      className={leadHasOpinionTreatment
        ? "byline-publication-preview live-home-shell live-home-shell-opinion-lead"
        : "byline-publication-preview live-home-shell"}
      data-theme={publication.appearance.theme}
    >
      <script
        id="website-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
      />
      {/* Design-driven: the lead package renders through the shared renderer
          that Studio also uses. The Brief, In Focus, Special Coverage, Opinion,
          More and Newsletter below are still legacy and will be extracted in
          later phases. */}
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

      {/* Design-driven: the sports package renders through the shared renderer
          that Studio also uses. */}
      <SportsPackage package={resolvedSports} />

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
