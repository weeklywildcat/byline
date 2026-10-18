import type { Metadata } from "@/lib/metadata";
import { HeroReveal, HeroRevealContent } from "@byline/ui";
import { ExploreCards } from "@/components/ExploreCards";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { NEWSROOM_PHOTOS } from "@/views/about/content";
import { RELATED } from "./content";

const publication = getPublicationConfig();

const title = "Diversity & Inclusion";
const description = `How ${publication.identity.shortName} decides who to cover, whose perspectives go into a story, who can join the staff and what to do when we miss something.`;

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/diversity-inclusion/" })
};

export default function DiversityInclusionPage() {
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
    <main className="di-page">
      <script id="di-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script
        id="di-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />

      <HeroReveal
        target="di-content"
        image={{
          src: "/diversity-inclusion/hero-1600.jpg",
          srcSet: "/diversity-inclusion/hero-960.jpg 960w, /diversity-inclusion/hero-1600.jpg 1600w, /diversity-inclusion/hero-2400.jpg 2400w",
          alt: "",
          width: 2400,
          height: 2400
        }}
      >
        <h1 className="di-hero-kicker">{title}</h1>
        <p className="di-hero-statement">
          {publication.identity.shortName} believes every student deserves to see their school and community represented
          accurately, fairly and fully. We want our newsroom to include voices, experiences and stories that are often
          overlooked.
        </p>
      </HeroReveal>

      <HeroRevealContent id="di-content">
      <div className="about-page">
      <section className="about-section" aria-labelledby="di-reporting-heading">
        <h2 id="di-reporting-heading">In our reporting</h2>
        <div className="about-section-body">
          <div className="about-prose about-prose-wide">
            <p>
              We look beyond the easiest voices to quote and the most visible clubs, teams and leadership groups. That means
              seeking a range of perspectives, covering issues that affect different groups of students, avoiding stereotypes
              or tokenism, and making room for students whose stories are not always treated as front-page stories.
            </p>
            <p>
              We talk directly to the people a story affects, and we ask how they would like to be described.
            </p>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="di-staff-heading">
        <h2 id="di-staff-heading">In the newsroom</h2>
        <div className="about-section-body">
          <div className="about-split about-split-media di-staff">
            <div className="about-prose">
              <p>
                {publication.identity.shortName} is open to students of any background or experience level. Any{" "}
                {publication.identity.organizationName} student can join, with no tryout, and new staff can start with a
                single assignment and take on more over time. Editors are chosen from the staff.
              </p>
              <p>
                We need writers, photographers, designers, illustrators, video creators, social media contributors and
                students with story ideas. See the <a href="/join/">Join page</a> for how to start.
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
              Readers should be able to follow {publication.identity.shortName} without fighting the page. If something is
              hard to read, hard to navigate, missing useful context or not working well on your device, we want to hear
              about it so we can make the site better. Tell us which page it was and what happened.
            </p>
          </div>
        </div>
      </section>

      <section className="about-band di-feedback" aria-labelledby="di-feedback-heading">
        <div className="about-band-inner">
          <h2 id="di-feedback-heading">Help us do better</h2>
          <p>
            Readers can suggest stories, flag coverage that felt inaccurate or exclusionary, request a correction, report an
            accessibility issue or share a concern without attaching their name. When you reach out, tell us what happened
            and how you would like your name handled. We will review the concern carefully and correct the record when
            needed.
          </p>
          <p className="di-feedback-actions">
            <a className="about-button" href="/contact/">
              Contact the editors
            </a>
          </p>
          <p className="di-feedback-note">
            To report a mistake in a story, you can also use the feedback form on the story. Published corrections are listed
            on the <a href="/corrections/">corrections page</a>.
          </p>
        </div>
      </section>

      <section className="about-explore" aria-labelledby="di-related-heading">
        <div className="about-explore-heading">
          <h2 id="di-related-heading">Related pages</h2>
        </div>
        <ExploreCards cards={RELATED} columns={4} />
      </section>
      </div>
      </HeroRevealContent>
    </main>
  );
}
