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
        <p className="about-kicker">Editorial standards</p>
        <h1>{title}</h1>
        <p className="about-lede">
          The {publication.identity.shortName} is produced by students at {publication.identity.organizationName} and serves
          the school and the surrounding community. This statement describes how the newsroom approaches representation,
          fairness, participation and accessibility in its work.
        </p>
      </header>

      <section className="about-section" aria-labelledby="di-cover-heading">
        <h2 id="di-cover-heading">Representation in coverage</h2>
        <div className="about-section-body">
          <div className="about-prose about-prose-wide">
            <p>
              The {publication.identity.shortName} covers {publication.identity.organizationName} and the community around it,
              including teams, clubs, classes and students that receive little attention. Editors consider whether coverage
              reflects the range of students and activities at the school, not only those that are most visible.
            </p>
            <p>
              Recent coverage includes{" "}
              <StoryRef story={about.story(DI_STORIES.directors)}>a theatre class production directed by three juniors</StoryRef>{" "}
              and <StoryRef story={about.story(DI_STORIES.edgewood)}>a middle school team&rsquo;s second-place finish at a
              national competition</StoryRef>.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-perspectives-heading">
        <h2 id="di-perspectives-heading">Sources and perspectives</h2>
        <div className="about-section-body">
          <div className="about-split">
            <p className="di-pull">Reporters speak with the people a story affects.</p>
            <div className="about-prose">
              <p>
                Reporters seek out the people directly affected by an issue and quote them in their own words. A story about a
                rule or policy includes someone subject to it, in addition to the person who enforces it. A story about a
                group includes members of that group, and no individual is presented as speaking for everyone like them.
              </p>
              <p>
                Reporters ask sources how they wish to be described. Assumptions about a person&rsquo;s background, abilities
                or home life are not included in a story unless the person provided the information and agreed to its
                publication.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-staff-heading">
        <h2 id="di-staff-heading">Newsroom participation</h2>
        <div className="about-section-body">
          <div className="about-split about-split-media di-staff">
            <div className="about-prose">
              <p>
                Any {publication.identity.organizationName} student may join the staff, in any grade and without prior
                experience or a tryout. Meetings are held in person and online, and equipment is available to borrow for
                students who need it. New members may begin with a single assignment and take on more responsibility over
                time. Editors are selected from the staff.
              </p>
              <p>
                Requirements and answers to common questions are on the <a href="/join/">Join page</a>.
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
              The newsroom writes for readers beyond the student body. Reporters are expected to spell out acronyms and explain
              school terminology, and photographs carry captions and credits.
            </p>
            <p>
              The newsroom relies on reader reports to identify accessibility problems. Readers who find content that is
              difficult to read or navigate, or that does not work on their device or assistive technology, are asked to
              tell the editors which page is affected and what the problem is.
            </p>
          </div>
        </div>
      </section>

      <section className="about-band di-feedback" aria-labelledby="di-feedback-heading">
        <div className="about-band-inner">
          <h2 id="di-feedback-heading">Concerns and feedback</h2>
          <p>
            Readers may contact the editors about a story or perspective the paper has not covered, coverage that appears
            unfair or inaccurate, a representation they consider mistaken, or an accessibility problem on the site. The
            editors review each concern and correct the record when it is warranted.
          </p>
          <p className="di-feedback-actions">
            <a className="about-button" href="/contact/">
              Contact the editors
            </a>
          </p>
          <p className="di-feedback-note">
            Concerns may be submitted without a name, or with instructions on how a name should be handled. Factual errors
            can also be reported through the feedback form on each story. Published corrections are listed on the{" "}
            <a href="/corrections/">corrections page</a>.
          </p>
        </div>
      </section>

      <section className="about-explore" aria-labelledby="di-related-heading">
        <div className="about-explore-heading">
          <h2 id="di-related-heading">Related pages</h2>
        </div>
        <ExploreCards cards={RELATED} columns={4} />
      </section>
    </main>
  );
}
