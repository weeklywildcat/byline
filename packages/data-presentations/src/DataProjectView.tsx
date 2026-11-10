import { createElement, type ReactNode } from "react";
import type { ResolvedDataProject } from "./resolve";

/**
 * How a host prints a presentation's own stylesheet. The public site (Vite)
 * inlines `styles.css` beside the page's content; the newsroom preview
 * (Next) loads it as a chunk and prints nothing. Never in this package.
 */
export type DataPresentationHost = { styles: (key: string) => ReactNode };

export type DataProjectNotes = {
  /** Plain text: where the facts come from. */
  source: string;
  /** Plain text paragraphs: how the data was gathered and checked. */
  methodology: string;
};

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);

/**
 * The one renderer for a Data Project, shared by the static page and the
 * newsroom preview: the project's heading and deck, the presentation's
 * server-rendered content (complete without script), and the source,
 * methodology and "Data updated" context. `client.ts`, when a presentation
 * has one, enhances `[data-data-root]` and nothing else.
 */
export function DataProjectView({ resolved, host, notes, related, kicker = "Data" }: { resolved: ResolvedDataProject; host: DataPresentationHost; notes: DataProjectNotes; related?: ReactNode; kicker?: ReactNode }) {
  const { definition, props } = resolved;
  const { key } = definition.descriptor;
  const { project, format } = props;
  const methodology = paragraphs(notes.methodology);
  return (
    <article className={`data-project data-presentation-${key}`} data-data-project={project.id} data-data-presentation={key} data-data-source={resolved.source}>
      {definition.descriptor.styles ? host.styles(key) : null}
      <header className="data-project-header">
        {kicker ? <p className="data-project-kicker">{kicker}</p> : null}
        <h1 className="data-project-title">{project.title}</h1>
        {project.deck ? <p className="data-project-deck">{project.deck}</p> : null}
        <p className="data-project-meta">
          <span>Data updated </span>
          <time dateTime={project.dataUpdatedAt}>{format.instant(project.dataUpdatedAt)}</time>
        </p>
      </header>
      <div className="data-project-body" data-data-root="" data-data-releases={JSON.stringify(resolved.releasePaths)}>
        {createElement(definition.Component, props)}
      </div>
      {notes.source || methodology.length || related ? (
        <footer className="data-project-notes">
          {notes.source ? (
            <section className="data-project-note" aria-labelledby={`data-source-${project.id}`}>
              <h2 id={`data-source-${project.id}`}>Source</h2>
              <p>{notes.source}</p>
            </section>
          ) : null}
          {methodology.length ? (
            <section className="data-project-note" aria-labelledby={`data-method-${project.id}`}>
              <h2 id={`data-method-${project.id}`}>About this data</h2>
              {methodology.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </section>
          ) : null}
          {related}
        </footer>
      ) : null}
    </article>
  );
}
