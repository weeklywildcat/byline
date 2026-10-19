import type { ReactNode } from "react";
import { Icon } from "@iconify/react/offline";
import type { Metadata } from "@/lib/metadata";
import { ExploreCards } from "@/components/ExploreCards";
import { PHOSPHOR_ICONS } from "@/lib/phosphor-icons";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import {
  CONTENTS,
  EXPLORE,
  INVOLVEMENT,
  NEWSROOM_PHOTOS,
  PHOTOS,
  ROLES,
  SHOW_NEWSROOM_TODAY,
  STORY_SLUGS,
  TIMELINE
} from "./content";
import { getAboutData, type AboutData, type AboutPhoto, type AboutStory } from "./data";

const publication = getPublicationConfig();

const title = "About";
const description = `${publication.identity.shortName} is the student newspaper of ${publication.identity.organizationName} in ${publication.location.city}, ${publication.location.region}. Learn who runs it, how it reports, where it came from and how to get involved.`;

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/about/" })
};

function StoryRef({ story, children }: { story?: AboutStory; children: ReactNode }) {
  return story ? <a href={story.href}>{children}</a> : <>{children}</>;
}

function Photo({ photo, className }: { photo: AboutPhoto | null; className?: string }) {
  if (!photo) return null;

  return (
    <figure className={className ? `about-photo ${className}` : "about-photo"}>
      <img {...photo.image} />
      <figcaption>
        {photo.caption ? <span>{photo.caption}</span> : null}
        {photo.credit ? <span className="photo-credit">Photo: {photo.credit}</span> : null}
      </figcaption>
    </figure>
  );
}

function formatCount(value: number) {
  return new Intl.NumberFormat(publication.locale).format(value);
}

export default async function AboutPage() {
  const about: AboutData = await getAboutData();
  const { stats, editors } = about;
  const story = (key: keyof typeof STORY_SLUGS) => about.story(STORY_SLUGS[key]);
  const websitePhoto = about.photo(PHOTOS.website.slug, PHOTOS.website.alt, "(max-width: 760px) 100vw, 440px");
  const schoolName = publication.identity.organizationName;

  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    name: `About ${publication.identity.shortName}`,
    description,
    url: absoluteUrl("/about/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: "/about/" }
  ]);

  return (
    <main className="about-page">
      <script id="about-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script
        id="about-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />

      <header className="about-masthead">
        <div className="about-masthead-main">
          <p className="about-kicker">About</p>
          <h1>About the {publication.identity.shortName}</h1>
          <p className="about-lede">
            {publication.identity.shortName} is the student newspaper of {schoolName} in {publication.location.city},{" "}
            {publication.location.region}. Students report, photograph, edit and design every story, and publish them here. We write for the people who
            follow this school: classmates, families, teachers, alumni and neighbors.
          </p>
        </div>
        <nav className="about-contents" aria-label="On this page">
          <p>On this page</p>
          <ol>
            {CONTENTS.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <section className="about-section" id="who-we-are" aria-labelledby="who-we-are-heading">
        <h2 id="who-we-are-heading">Who we are</h2>
        <div className="about-section-body">
          <div className="about-split">
            <div className="about-prose">
              <p>
                {publication.identity.shortName} is a working newsroom made up of students. The people who report a story
                often take the photographs, edit each other&rsquo;s drafts and help publish the result. Roles overlap, and
                students often take on more as they get comfortable.
              </p>
              <p>
                The staff works mostly online. Assignments and story discussions happen in Discord, meetings in Google Meet,
                and files in a shared drive, so a story does not live only on one person&rsquo;s laptop. Staff get a
                separate @weeklywildcat.com account for newspaper work, and the newsroom keeps a few loaner laptops for
                students who need one.
              </p>
            </div>
            <dl className="about-roles">
              {ROLES.map((role) => (
                <div key={role.title}>
                  <dt>{role.title}</dt>
                  <dd>{role.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="about-photo-pair about-photo-pair-mixed">
            {NEWSROOM_PHOTOS.map((photo) => (
              <figure className="about-photo" key={photo.file}>
                <img
                  src={`/newsroom/${photo.file}-1000.jpg`}
                  srcSet={`/newsroom/${photo.file}-640.jpg 640w, /newsroom/${photo.file}-1000.jpg 1000w, /newsroom/${photo.file}-1600.jpg 1600w`}
                  sizes="(max-width: 760px) 100vw, 640px"
                  width={photo.width}
                  height={photo.height}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>
                  <span>{photo.caption}</span>
                  <span className="photo-credit">Photo: {photo.credit.replace(/ for Weekly Wildcat$/, "")}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {SHOW_NEWSROOM_TODAY ? (
        <section className="about-band" aria-labelledby="newsroom-today-heading">
          <div className="about-band-inner">
            <h2 id="newsroom-today-heading">The newsroom today</h2>
            <dl className="about-stats">
              <div>
                <dt>{stats.firstStoryDate ? `Stories published since ${stats.firstStoryDate}` : "Stories published"}</dt>
                <dd>{formatCount(stats.storyCount)}</dd>
              </div>
              <div>
                <dt>Contributors in the staff directory</dt>
                <dd>{formatCount(stats.contributorCount)}</dd>
              </div>
              {stats.archive ? (
                <div>
                  <dt>
                    Game records in the sports archive, across {stats.archive.sports} sports
                    {stats.archive.earliestSeason ? `, back to ${stats.archive.earliestSeason}` : ""}
                  </dt>
                  <dd>{formatCount(stats.archive.games)}</dd>
                </div>
              ) : null}
            </dl>
            {editors.length ? (
              <div className="about-editors">
                <h3>Editors</h3>
                <ul>
                  {editors.map((editor) => (
                    <li key={editor.href}>
                      <a href={editor.href}>
                        {editor.photo ? (
                          <img
                            className="author-avatar"
                            src={editor.photo.url}
                            alt=""
                            width={editor.photo.width ?? 96}
                            height={editor.photo.height ?? 96}
                            loading="lazy"
                          />
                        ) : (
                          <span className="author-avatar author-avatar-fallback" aria-hidden="true">
                            {editor.name.slice(0, 1)}
                          </span>
                        )}
                        <span>
                          <strong>{editor.name}</strong>
                          <small>{editor.role}</small>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p>
                  <a href="/leadership/">How leadership works</a>
                  <a href="/staff/">All contributors</a>
                </p>
              </div>
            ) : null}
            <p className="about-band-note">Counts are calculated each time the site is built.</p>
          </div>
        </section>
      ) : null}

      <section className="about-section" id="history" aria-labelledby="history-heading">
        <h2 id="history-heading">Our history</h2>
        <div className="about-section-body">
          <div className="about-split about-split-history">
            <div className="about-prose">
              <p>
                Student journalism at {schoolName} is older than this website, though it has not been continuous. In the
                mid-2000s the school offered a class called TV Communications, where students produced a weekly news
                broadcast. Each week they pitched ideas, planned their footage and cut segments to fit a five-to-seven-minute
                show, with a different student anchoring each time, as{" "}
                <StoryRef story={story("relaunch")}>our January 2026 story on the relaunch</StoryRef> described it.
              </p>
              <p>
                A regularly produced school newspaper is a separate matter. Principal Sprowl told one of our reporters it had been
                more than twenty years since the school made one. Around 2022, a group of students worked with Mrs.
                Blackwell and Mr. Sprowl to restart it, but the group faded as its members took on other activities and
                heavier classes.
              </p>
              <p>
                A new group of students took up the job in the 2025&ndash;26 school year. They worked with Principal Sprowl to
                get the paper approved
                {stats.firstStoryDate ? ` and published their first story on ${stats.firstStoryDate}` : ""}. Since then the
                staff has reported on sports, school life and the community and{" "}
                <StoryRef story={story("websiteUpgrade")}>rebuilt the website</StoryRef> it publishes on.
              </p>
            </div>
            <ol className="about-timeline" aria-label="Timeline">
              {TIMELINE.map((entry) => {
                const linked = "storySlug" in entry ? about.story(entry.storySlug) : undefined;

                return (
                  <li key={entry.when}>
                    <p className="about-timeline-when">{entry.when}</p>
                    <p>
                      {entry.text}
                      {linked ? (
                        <>
                          {" "}
                          <a href={linked.href}>Read the story</a>
                        </>
                      ) : null}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <section className="about-section" id="ai" aria-labelledby="ai-heading">
        <h2 id="ai-heading">Artificial intelligence</h2>
        <div className="about-section-body">
          <div className="about-ai">
            <Icon className="about-ai-icon" icon={PHOSPHOR_ICONS.sparkle} width={32} height={32} aria-hidden="true" />
            <div className="about-prose">
              <p>
                Technology is changing how people work, including in journalism. We use AI for technical and
                behind-the-scenes work, including coding, transcription, research help and reviewing work for problems.
              </p>
              <p>Our rule is simple: if we expect someone to take the time to read something, we should take the time to write it.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" id="funding" aria-labelledby="funding-heading">
        <h2 id="funding-heading">Money and independence</h2>
        <div className="about-section-body">
          <div className="about-split">
            <div className="about-prose">
              <p>
                {publication.identity.shortName} runs on a $0 budget and does not receive school funding. Reading it is
                free.
              </p>
              <p>
                We welcome sponsors and donations that help fund student journalism, as well as advertising from local
                businesses and organizations. The <a href="/advertise/">advertising page</a> explains how to start. To
                talk about a sponsorship or a gift, use the <a href="/contact/">contact page</a> and tell us what you have
                in mind.
              </p>
            </div>
            <div className="about-prose">
              <p>
                Our students decide what we publish. If sponsors, advertisers or donors come on board, we&rsquo;ll be
                grateful for the support, and they still won&rsquo;t choose our stories or see them before they run.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" id="technology" aria-labelledby="technology-heading">
        <h2 id="technology-heading">Behind the website</h2>
        <div className="about-section-body">
          <div className="about-split about-split-media">
            <div className="about-prose">
              <p>
                Our students build and run the technology behind the paper, too. Editors write and schedule stories in
                WordPress, which readers never see. What readers visit is a separate, static website built from that
                content. It loads fast and stays online even when we take the publishing system down for maintenance. The
                software is called Byline, and its code is public on{" "}
                <a href="https://github.com/weeklywildcat/byline">GitHub</a> for anyone to read or suggest improvements.
              </p>
              {stats.archive ? (
                <p>
                  Byline also holds our sports archive: {formatCount(stats.archive.games)} game records across{" "}
                  {stats.archive.sports} sports
                  {stats.archive.earliestSeason ? `, going back to the ${stats.archive.earliestSeason} season` : ""}.{" "}
                  <a href={stats.archive.href}>Browse the archive</a>.
                </p>
              ) : null}
              <p>
                We also maintain Tilecast, an open source signage system that runs the screens at the school. You can read
                about both projects on the <a href="/open-source/">Open Source page</a>.
              </p>
            </div>
            <Photo photo={websitePhoto} />
          </div>
        </div>
      </section>

      <section className="about-section" id="get-involved" aria-labelledby="get-involved-heading">
        <h2 id="get-involved-heading">Get involved</h2>
        <div className="about-section-body">
          <ul className="about-involvement">
            {INVOLVEMENT.map((item) => (
              <li key={item.title}>
                <p className="about-involvement-audience">{item.audience}</p>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href={item.href}>{item.action}</a>
              </li>
            ))}
          </ul>
          {publication.social.length ? (
            <p className="about-social">
              Follow the newsroom on{" "}
              {publication.social.map((account, index) => (
                <span key={account.url}>
                  {index > 0 ? (index === publication.social.length - 1 ? " and " : ", ") : ""}
                  <a href={account.url}>{account.label}</a>
                </span>
              ))}
              .
            </p>
          ) : null}
        </div>
      </section>

      <section className="about-explore" id="explore" aria-labelledby="explore-heading">
        <div className="about-explore-heading">
          <h2 id="explore-heading">Explore the {publication.identity.shortName}</h2>
          <p>More about the newsroom, its people and how to reach it.</p>
        </div>
        <ExploreCards cards={EXPLORE} />
      </section>
    </main>
  );
}
