import type { Metadata } from "next";
import { HomepageHeroRailLimiter } from "@/components/HomepageHeroRailLimiter";
import { HomepageStory } from "@/components/HomepageStory";
import { NewsletterSignupForm } from "@/components/NewsletterSignupForm";
import { PollWidget } from "@/components/PollWidget";
import { SiteIcon } from "@/components/SiteIcon";
import { SportsAthleteFeature } from "@/components/SportsAthleteFeature";
import { SportsSchedulePanel } from "@/components/SportsSchedulePanel";
import { ThisWeekCard } from "@/components/ThisWeekCard";
import { filterPublicHomepagePosts, isAthleteSpotlightPost, isSpecialCoveragePost } from "@/lib/content";
import {
  getRecentSportsGames,
  getSchoolEvents,
  getUpcomingSportsGames,
  type SchoolEvent,
  type SportsGame
} from "@/lib/headless";
import { absoluteUrl, buildPageMetadata, getWebsiteSchema, serializeJsonLd, SITE_DESCRIPTION } from "@/lib/seo";
import { getFeaturedMedia, getAllPosts, getPostCategories, type WordPressPost } from "@/lib/wordpress";

export const metadata: Metadata = buildPageMetadata({
  title: "Weekly Wildcat",
  description: SITE_DESCRIPTION,
  path: "/"
});

function hasCategory(post: WordPressPost, slugs: string[]) {
  const slugSet = new Set(slugs);

  return getPostCategories(post).some((category) => slugSet.has(category.slug));
}

function takeUnused(posts: WordPressPost[], usedPostIds: Set<number>, count: number, predicate = (_post: WordPressPost) => true) {
  const selected: WordPressPost[] = [];

  for (const post of posts) {
    if (usedPostIds.has(post.id) || !predicate(post)) {
      continue;
    }

    selected.push(post);
    usedPostIds.add(post.id);

    if (selected.length === count) {
      break;
    }
  }

  return selected;
}

function takeOneUnused(posts: WordPressPost[], usedPostIds: Set<number>, predicate: (post: WordPressPost) => boolean) {
  return takeUnused(posts, usedPostIds, 1, predicate)[0] ?? null;
}

function takeDiverseUnused(
  posts: WordPressPost[],
  usedPostIds: Set<number>,
  count: number,
  categorySlugs: string[]
) {
  const selected: WordPressPost[] = [];
  const oldFirstPosts = [...posts].reverse();

  const addPost = (post: WordPressPost) => {
    selected.push(post);
    usedPostIds.add(post.id);
  };

  for (const slug of categorySlugs) {
    const post = oldFirstPosts.find((candidate) => !usedPostIds.has(candidate.id) && hasCategory(candidate, [slug]));

    if (post) {
      addPost(post);
    }

    if (selected.length === count) {
      return selected;
    }
  }

  for (const post of oldFirstPosts) {
    if (usedPostIds.has(post.id)) {
      continue;
    }

    addPost(post);

    if (selected.length === count) {
      break;
    }
  }

  return selected;
}

async function getHomepageSportsSchedule() {
  const [recentScores, upcomingGames, schoolEvents] = await Promise.all([
    getRecentSportsGames(3).catch((): SportsGame[] => []),
    getUpcomingSportsGames(8).catch((): SportsGame[] => []),
    getSchoolEvents(12).catch((): SchoolEvent[] => [])
  ]);

  return { recentScores, upcomingGames, schoolEvents };
}

export default async function HomePage() {
  const [allPosts, sportsSchedule] = await Promise.all([getAllPosts(), getHomepageSportsSchedule()]);
  const websiteSchema = getWebsiteSchema();
  const posts = filterPublicHomepagePosts(allPosts);
  const usedPostIds = new Set<number>();
  const athleteSpotlightPost = posts.find(isAthleteSpotlightPost) ?? null;

  if (athleteSpotlightPost) {
    usedPostIds.add(athleteSpotlightPost.id);
  }

  const leadPost = posts.find((post) => !usedPostIds.has(post.id) && post.sticky) ?? posts.find((post) => !usedPostIds.has(post.id)) ?? null;

  if (leadPost) {
    usedPostIds.add(leadPost.id);
  }

  const inFocusPost = takeOneUnused(
    posts,
    usedPostIds,
    (post) => Boolean(getFeaturedMedia(post)) && hasCategory(post, ["features", "culture"])
  );
  const specialCoveragePosts = takeUnused(posts, usedPostIds, 3, isSpecialCoveragePost);
  const opinionPosts = takeUnused(posts, usedPostIds, 3, (post) => hasCategory(post, ["opinion"]));
  const opinionLeadPost = opinionPosts[0] ?? null;
  const opinionRailPosts = opinionPosts.slice(1, 3);
  const fieldPosts = takeUnused(posts, usedPostIds, 3, (post) => hasCategory(post, ["sports"]));
  const fieldLeadPost = fieldPosts[0] ?? null;
  const fieldRailPosts = fieldPosts.slice(1, 3);
  const morePosts = takeDiverseUnused(posts, usedPostIds, 4, ["news", "features", "culture", "opinion", "sports"]);
  const moreLeadPost = morePosts[0] ?? null;
  const moreRailPosts = morePosts.slice(1, 4);
  const rightNowPosts = takeUnused(posts, usedPostIds, 4);
  const briefPosts = takeUnused(posts, usedPostIds, 4);
  const briefLeadPost = briefPosts[0] ?? null;
  const briefRailPosts = briefPosts.slice(1);
  const hasFieldSection =
    fieldPosts.length > 0 ||
    Boolean(athleteSpotlightPost) ||
    sportsSchedule.recentScores.length > 0 ||
    sportsSchedule.upcomingGames.length > 0;

  return (
    <main className="live-home-shell">
      <script
        id="website-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema) }}
      />
      {leadPost ? (
        <section
          className={rightNowPosts.length > 0 ? "top-stories" : "top-stories top-stories-single"}
          aria-labelledby="lead-heading"
        >
          <div className="top-stories-layout" data-homepage-top-stories>
            <HomepageHeroRailLimiter />
            <div className="live-lead" data-homepage-lead>
              <HomepageStory
                post={leadPost}
                variant="lead"
                homepageTreatment={leadPost.weeklyWildcat?.homepageOpinionTreatment ? "opinion" : undefined}
                showDeck
                priority
              />
            </div>

            {rightNowPosts.length > 0 ? (
              <aside className="top-stories-rail" aria-labelledby="right-now-heading">
                <h2 id="right-now-heading">The Latest</h2>
                <div className="right-now-list">
                  {rightNowPosts.map((post) => (
                    <HomepageStory key={post.id} post={post} variant="briefing" showAuthor />
                  ))}
                </div>
              </aside>
            ) : null}

            <aside className="top-stories-left-rail" aria-label="Poll and school calendar">
              <PollWidget />
              <ThisWeekCard maxVisibleItems={3} schoolEvents={sportsSchedule.schoolEvents} sportsGames={sportsSchedule.upcomingGames} />
            </aside>
          </div>
        </section>
      ) : (
        <p className="empty-state">No published posts are available yet.</p>
      )}

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
              <p>Student perspectives, columns, and commentary from Weekly Wildcat writers.</p>
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
            <a href="/category/sports/">All Sports →</a>
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
            <h2 id="more-heading">More From Weekly Wildcat</h2>
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

            <aside className="more-utility-rail" aria-label="Weekly Wildcat links">
              <p className="more-rail-label">Weekly Wildcat</p>
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
                  <a href="/about/">
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
                <p>Follow daily posts, send a tip, or bring Weekly Wildcat into your inbox.</p>
                <nav className="more-connect-links" aria-label="Stay connected">
                  <a href="https://www.instagram.com/theweeklywildcat" target="_blank" rel="noreferrer">
                    <SiteIcon name="ph:instagram-logo" width={17} height={17} />
                    Instagram
                  </a>
                  <a href="https://www.tiktok.com/@weeklywildcat" target="_blank" rel="noreferrer">
                    <SiteIcon name="ph:tiktok-logo" width={17} height={17} />
                    TikTok
                  </a>
                  <a href="/contact/">
                    <SiteIcon name="ph:envelope-simple" width={17} height={17} />
                    Contact
                  </a>
                  <a href="#home-newsletter">
                    <SiteIcon name="ph:paper-plane-tilt" width={17} height={17} />
                    Newsletter
                  </a>
                </nav>
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <section id="home-newsletter" className="home-newsletter-section" aria-label="Newsletter signup">
        <NewsletterSignupForm />
      </section>
    </main>
  );
}
