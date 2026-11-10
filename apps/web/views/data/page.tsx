import type { Metadata } from "@/lib/metadata";
import { publicDataProjects } from "@/lib/public-data";
import { getPublicationConfig } from "@/lib/publication";
import { buildPageMetadata } from "@/lib/seo";

export async function getMetadata(): Promise<Metadata> {
  const publication = getPublicationConfig();
  return buildPageMetadata({
    title: "Data",
    description: `Trackers, tables and results from ${publication.identity.shortName}, kept up to date by the newsroom.`,
    path: "/data/",
    noIndex: !publicDataProjects().some((project) => project.indexing === "public")
  });
}

/** The index of published Data Projects, newest data first. */
export default async function DataIndexPage() {
  const publication = getPublicationConfig();
  const format = new Intl.DateTimeFormat(publication.locale, { timeZone: publication.timezone, month: "short", day: "numeric", year: "numeric" });
  const projects = [...publicDataProjects()].sort((a, b) => b.dataUpdatedAt.localeCompare(a.dataUpdatedAt) || a.title.localeCompare(b.title));
  return (
    <main className="section-page-shell data-index">
      <header className="data-project-header">
        <h1 className="data-project-title">Data</h1>
        <p className="data-project-deck">Trackers, tables and results from {publication.identity.shortName}, kept up to date by the newsroom.</p>
      </header>
      {projects.length ? (
        <ol className="data-index-list">
          {projects.map((project) => (
            <li key={project.id} className="data-index-item">
              <h2><a href={project.href}>{project.title}</a></h2>
              {project.deck ? <p>{project.deck}</p> : null}
              <p><time dateTime={project.dataUpdatedAt}>Updated {format.format(new Date(project.dataUpdatedAt))}</time></p>
            </li>
          ))}
        </ol>
      ) : <p className="data-index-empty">Nothing here yet.</p>}
    </main>
  );
}
