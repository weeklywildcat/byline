import type { Metadata } from "@/lib/metadata";
import { ExploreCards } from "@/components/ExploreCards";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { NEWSROOM_PHOTOS } from "@/views/about/content";
import { getAboutData, type AboutStory } from "@/views/about/data";
import { DI_STORIES, RELATED } from "./content";
import type { ReactNode } from "react";

const publication = getPublicationConfig();

const title = "Diversity & Inclusion";
const description = `How ${publication.identity.shortName} decides who to cover, whose perspectives go into a story, who can join the staff and what to do when we miss something.`;

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/diversity-inclusion/" })
};

function StoryRef({ story, children }: { story?: AboutStory; children: ReactNode }) {
  return story ? <a href={story.href}>{children}</a> : <>{children}</>;
}

export default async function DiversityInclusionPage() {
  const about = await getAboutData();
  const photo = NEWSROOM_PHOTOS[0];
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl("/diversity-inclusion/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: "/diversity-inclusion/" }
  ]);

  return (
    <main className="about-page di-page">
      <script id="di-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script
        id="di-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />

      <header className="di-masthead">
        <p className="about-kicker">Standards</p>
        <h1>{title}</h1>
        <p className="about-lede">
          Everything in the {publication.identity.shortName} comes from what a few students notice, ask about and decide is
          worth a story. That is a narrow filter. This page explains how we try to widen it, and what to do when we miss
          something.
        </p>
      </header>

      <section className="about-section" aria-labelledby="di-cover-heading">
        <h2 id="di-cover-heading">Who we cover</h2>
        <div className="about-section-body">
          <div className="about-prose about-prose-wide">
            <p>
              Some stories announce themselves: a home game, a school event, a club with posters in the hallway. Others only
              get written if someone goes looking, like{" "}
              <StoryRef story={about.story(DI_STORIES.directors)}>a class production directed by three juniors</StoryRef> or{" "}
              <StoryRef story={about.story(DI_STORIES.edgewood)}>a middle school team that finished second nationally</StoryRef>
              . We want to write more of the second kind.
            </p>
            <p>
              That means looking past the people who are easiest to quote. A team captain or a club officer is easy to find,
              and what they say is real, but it is one view. When we cover a team, a club or a rule, we try to ask who else is
              part of it and whether we have talked to them.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-perspectives-heading">
        <h2 id="di-perspectives-heading">Whose perspectives go in a story</h2>
        <div className="about-section-body">
          <div className="about-split">
            <p className="di-pull">A story about a rule should include someone the rule applies to, not only the adult who enforces it.</p>
            <div className="about-prose">
              <p>
                The same goes for a group. If a story is about students who share something, such as a sport, a class, a
                language or a disability, the people in it should speak for themselves, and we try not to treat one student as
                the voice of everyone like them.
              </p>
              <p>
                We ask people how they want to be described instead of guessing. Assumptions about someone&rsquo;s
                background, abilities or home life stay out of a story unless the person told us the fact and is fine with it
                being printed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-staff-heading">
        <h2 id="di-staff-heading">Who is on the staff</h2>
        <div className="about-section-body">
          <div className="about-split about-split-media di-staff">
            <div className="about-prose">
              <p>
                A paper written by one kind of student will keep missing the same stories. Any Ninety Six High School student
                can join, in any grade, with no experience and no tryout. Meetings are flexible and hybrid, the newsroom has
                laptops and equipment to borrow, and a new member can start with one small piece of work and take on more.
              </p>
              <p>
                Editors are chosen from the staff, so students who start by writing a short item can end up deciding what the
                paper covers. The <a href="/join/">Join page</a> has the details.
              </p>
            </div>
            <figure className="about-photo di-photo">
              <img
                src={`/newsroom/${photo.file}-1000.jpg`}
                srcSet={`/newsroom/${photo.file}-640.jpg 640w, /newsroom/${photo.file}-1000.jpg 1000w, /newsroom/${photo.file}-1600.jpg 1600w`}
                sizes="(max-width: 860px) 100vw, 420px"
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
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-access-heading">
        <h2 id="di-access-heading">Accessibility</h2>
        <div className="about-section-body">
          <div className="about-prose about-prose-wide">
            <p>
              We write for readers who are not students, so we try to spell out acronyms and explain school terms instead of
              assuming everyone knows them. Photographs carry captions and credits.
            </p>
            <p>
              A small staff cannot test every device and assistive tool, so we rely on readers to tell us when something does
              not work. If a page is hard to read, hard to navigate or breaks on your device, tell us what happened and which
              page it was on.
            </p>
          </div>
        </div>
      </section>

      <section className="about-band di-feedback" aria-labelledby="di-feedback-heading">
        <div className="about-band-inner">
          <h2 id="di-feedback-heading">What are we missing?</h2>
          <p>
            Is there a group, a team, a problem or a point of view the paper keeps skipping? Did a story get something wrong
            about you or people like you? Did a page not work for you? Tell the editors.
          </p>
          <p className="di-feedback-actions">
            <a className="about-button" href="/contact/">
              Contact the editors
            </a>
          </p>
          <p className="di-feedback-note">
            You can ask us to keep your name private. For a mistake of fact, you can also use the feedback form on the story
            itself, and published corrections are listed on the <a href="/corrections/">corrections page</a>.
          </p>
        </div>
      </section>

      <section className="about-explore" aria-labelledby="di-related-heading">
        <div className="about-explore-heading">
          <h2 id="di-related-heading">More about the newsroom</h2>
        </div>
        <ExploreCards cards={RELATED} columns={4} />
      </section>
    </main>
  );
}
