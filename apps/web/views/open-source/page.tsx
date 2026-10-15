import type { Metadata } from "@/lib/metadata";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

const publication = getPublicationConfig();

type Project = {
  name: string;
  label: string;
  description: string;
  details: string[];
  links: { label: string; href: string }[];
};

const projects: Project[] = [
  {
    name: "Byline",
    label: "Newsroom platform",
    description: `The software behind ${publication.identity.shortName}: the public website, the newsroom tools our editors use and the shared theme that gives the paper its look.`,
    details: [
      "A static Astro website with no public server to run",
      "A WordPress plugin for editing, planning and publishing",
      "An optional Discord bot for newsroom workflows",
      "Shared packages for content, themes and design"
    ],
    links: [
      { label: "View on GitHub", href: "https://github.com/weeklywildcat/byline" },
      { label: "Read the docs", href: "https://github.com/weeklywildcat/byline/tree/main/docs" }
    ]
  },
  {
    name: "Tilecast",
    label: "Digital signage · AGPL-3.0",
    description: `Self-hosted digital signage that our team builds and maintains. It runs the TVs at ${publication.identity.organizationName}, and anyone can run it for their own school, library or business.`,
    details: [
      "Playlists, layouts, schedules and live data for any screen",
      "Players for Android TV, Fire TV, Google TV, Linux and Windows",
      "Runs on your own hardware with no subscription or hosted service"
    ],
    links: [
      { label: "Visit tilecast.org", href: "https://tilecast.org/" },
      { label: "View on GitHub", href: "https://github.com/gbyo/tilecast" }
    ]
  }
];

const title = `Open Source at ${publication.identity.shortName}`;
const description = `${publication.identity.shortName} builds its newsroom software in the open, and our team maintains Tilecast, the open source signage system that runs the screens at school.`;

export const metadata: Metadata = {
  ...buildPageMetadata({
    title,
    description,
    path: "/open-source/"
  })
};

export default function OpenSourcePage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl("/open-source/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Open Source", path: "/open-source/" }
  ]);

  return (
    <main className="static-page-shell open-source-page">
      <script
        id="open-source-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }}
      />
      <script
        id="open-source-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <article className="static-page">
        <header className="static-page-header">
          <p>Built by students</p>
          <h1>{title}</h1>
          <div className="static-page-deck">
            Our team writes the software that publishes {publication.identity.shortName} and the software that runs the
            screens around {publication.identity.organizationName}. We keep that code public so other student newsrooms
            and schools can learn from it, borrow it and make it better.
          </div>
        </header>

        <div className="open-source-projects">
          {projects.map((project) => (
            <section className="open-source-project" key={project.name} aria-labelledby={`open-source-${project.name.toLowerCase()}`}>
              <p className="open-source-project-label">{project.label}</p>
              <h2 id={`open-source-${project.name.toLowerCase()}`}>{project.name}</h2>
              <p>{project.description}</p>
              <ul>
                {project.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <div className="open-source-project-links">
                {project.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
