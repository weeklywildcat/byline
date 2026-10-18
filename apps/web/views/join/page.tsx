import type { ReactNode } from "react";
import type { Metadata } from "@/lib/metadata";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import { NEWSROOM_PHOTOS, ROLES } from "@/views/about/content";
import { CONTACT_EMAIL, FAQ, LEARNING } from "./content";

const publication = getPublicationConfig();

const title = "Join the Newsroom";
const description = `Any ${publication.identity.organizationName} student can join ${publication.identity.shortName}, at any time of year, with or without experience. See what students do, how to start and answers to common questions.`;

export const metadata: Metadata = {
  ...buildPageMetadata({ title, description, path: "/join/" })
};

// Turns the newsroom email address in a line of copy into a mailto link.
function withEmailLink(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);

  return parts.flatMap((part, index) =>
    index === 0 ? [part] : [<a key={index} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>, part]
  );
}

export default function JoinPage() {
  const photo = NEWSROOM_PHOTOS[1];
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl("/join/")
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer }
    }))
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: title, path: "/join/" }
  ]);

  return (
    <main className="about-page join-page">
      <script id="join-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }} />
      <script id="join-faq-json-ld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqSchema) }} />
      <script
        id="join-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />

      <header className="about-masthead join-masthead">
        <div className="about-masthead-main">
          <p className="about-kicker">Newsroom</p>
          <h1>Join the {publication.identity.shortName}</h1>
          <p className="about-lede">
            The Weekly Wildcat covers the people, events and issues that shape life at Ninety Six High School. We're always
            looking for students who are curious about what's happening around them and want to be part of that work. No
            experience is needed, and you can join at any time.
          </p>
          <p className="join-start">
            To start, talk to Mr. Mackin or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
        <figure className="about-photo join-photo">
          <img
            src={`/newsroom/${photo.file}-1000.jpg`}
            srcSet={`/newsroom/${photo.file}-640.jpg 640w, /newsroom/${photo.file}-1000.jpg 1000w, /newsroom/${photo.file}-1600.jpg 1600w`}
            sizes="(max-width: 860px) 100vw, 520px"
            width={photo.width}
            height={photo.height}
            alt={photo.alt}
            decoding="async"
          />
          <figcaption>
            <span className="photo-credit">Photo: {photo.credit.replace(/ for Weekly Wildcat$/, "")}</span>
          </figcaption>
        </figure>
      </header>

      <section className="about-section" aria-labelledby="join-roles-heading">
        <h2 id="join-roles-heading">What you can do</h2>
        <div className="about-section-body">
          <div className="about-split">
            <div className="about-prose">
              <p>
                You do not have to be a writer. The paper needs people who report and write, photograph, edit, design and
                run the website. Roles overlap, and most people start small and take on more as they get comfortable.
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
        </div>
      </section>

      <section className="about-section" aria-labelledby="join-learn-heading">
        <h2 id="join-learn-heading">What you&rsquo;ll learn</h2>
        <div className="about-section-body">
          <div className="about-split">
            <div className="about-prose">
              <p>
                Staff members learn by doing work that gets published. The goal is not only to put out a newspaper. It is to
                help students become sharper communicators, whatever they go on to do.
              </p>
            </div>
            <ul className="join-list">
              {LEARNING.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="about-section" aria-labelledby="join-faq-heading">
        <h2 id="join-faq-heading">Questions</h2>
        <div className="about-section-body">
          <div className="join-faq">
            {FAQ.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{withEmailLink(item.answer)}</p>
              </details>
            ))}
          </div>
          <p className="join-more">
            Something else? <a href="/contact/">Contact the newsroom</a>, read <a href="/about/">about the Weekly Wildcat</a> or
            see <a href="/leadership/">how leadership works</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
