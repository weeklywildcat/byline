import type { Metadata } from "@/lib/metadata";
import { SectionHeader } from "@/components/SectionHeader";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";

const publication = getPublicationConfig();
const githubOrg = "https://github.com/weeklywildcat";

type Project = {
  name: string;
  status: string;
  description: string;
  details: string[];
  links: { label: string; href: string }[];
};

const featuredProjects: Project[] = [
  {
    name: "Byline",
    status: "Newsroom platform",
    description: `The software behind ${publication.identity.shortName}: the public website, the newsroom tools our editors use and the shared theme that gives the paper its look.`,
    details: [
      "A static Astro website with no public server to run",
      "A WordPress plugin for editing, planning and publishing",
      "An optional Discord bot for newsroom workflows",
      "Shared packages for content, themes and design"
    ],
    links: [
      { label: "View on GitHub", href: `${githubOrg}/byline` },
      { label: "Read the docs", href: `${githubOrg}/byline/tree/main/docs` }
    ]
  },
  {
    name: "Tilecast",
    status: "Digital signage · AGPL-3.0",
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

const otherProjects: Project[] = [
  {
    name: "Flow",
    status: "Library",
    description: "A check in and check out system built for the school library.",
    details: [],
    links: [{ label: "View on GitHub", href: `${githubOrg}/flow` }]
  },
  {
    name: "Library Presence",
    status: "Tilecast package · AGPL-3.0",
    description: "A Tilecast package that shows live library occupancy and welcomes new arrivals on screen. Still in development.",
    details: [],
    links: [{ label: "View on GitHub", href: `${githubOrg}/tilecast-library-presence` }]
  },
  {
    name: "ID",
    status: "Student media",
    description: "Verifies student media IDs. It is a convenience, not a security system.",
    details: [],
    links: [{ label: "View on GitHub", href: `${githubOrg}/id` }]
  }
];

const description = `${publication.identity.shortName} builds its newsroom software in the open, and our team maintains Tilecast, the open source signage system that runs the screens at school.`;

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: `Open Source at ${publication.identity.shortName}`,
    description,
    path: "/open-source/"
  })
};

export default function OpenSourcePage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `Open Source at ${publication.identity.shortName}`,
    description,
    url: absoluteUrl("/open-source/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Open Source", path: "/open-source/" }
  ]);

  return (
    <main className="section-page-shell open-source-page">
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

      <SectionHeader
        title={`Open Source at ${publication.identity.shortName}`}
        description="The software behind our newsroom and our school's screens, public for anyone to read, learn from and build on."
        level={1}
      />

      <section className="media-kit-intro" aria-labelledby="open-source-intro-heading">
        <div>
          <p className="profile-kicker">Built by students</p>
          <h2 id="open-source-intro-heading">We publish the tools we build.</h2>
        </div>
        <p>
          {publication.identity.shortName} is more than a newspaper. Our team writes the software that publishes it and
          the software that runs the screens around {publication.identity.organizationName}, and we keep that code
          public so other student newsrooms and schools can learn from it, borrow it and make it better.
        </p>
      </section>

      <section className="media-kit-section" aria-labelledby="open-source-featured-heading">
        <div className="media-kit-section-heading">
          <h2 id="open-source-featured-heading">Featured projects</h2>
          <p>The two projects our team puts the most work into.</p>
        </div>
        <div className="open-source-featured-grid">
          {featuredProjects.map((project) => (
            <article className="open-source-card open-source-card-featured" key={project.name}>
              <p className="media-kit-card-meta">{project.status}</p>
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <ul>
                {project.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <div className="media-kit-card-actions">
                {project.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="media-kit-section" aria-labelledby="open-source-more-heading">
        <div className="media-kit-section-heading">
          <h2 id="open-source-more-heading">More from our GitHub</h2>
          <p>Smaller tools we built for our own school. Some are still changing.</p>
        </div>
        <div className="open-source-more-grid">
          {otherProjects.map((project) => (
            <article className="open-source-card" key={project.name}>
              <p className="media-kit-card-meta">{project.status}</p>
              <h3>{project.name}</h3>
              <p>{project.description}</p>
              <div className="media-kit-card-actions">
                {project.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.label}
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="media-kit-section" aria-labelledby="open-source-involved-heading">
        <div className="media-kit-section-heading">
          <h2 id="open-source-involved-heading">Get involved</h2>
          <p>Use our code, report a bug or tell us what you build with it.</p>
        </div>
        <div className="media-kit-broll-panel">
          <div>
            <h3>Starting a student newsroom or a signage network?</h3>
            <p>
              Browse the repositories, open an issue if something is unclear, or contact the newsroom and we will
              point you in the right direction. Check each repository for its license before reusing its code.
            </p>
          </div>
          <a href={githubOrg}>See all repositories</a>
        </div>
      </section>
    </main>
  );
}
