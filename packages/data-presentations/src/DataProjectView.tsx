import { createElement, type ReactNode } from "react";
import type { DataHeadingLevel } from "./sdk";
import type { ResolvedDataProject } from "./resolve";

/**
 * How a host prints a presentation's own stylesheet. The public site (Vite)
 * inlines `styles.css` beside the page's content; the newsroom preview
 * (Next) loads it as a chunk and prints nothing. Never in this package.
 */
export type DataPresentationHost = {
  styles: (key: string) => ReactNode;
  /**
   * The Story-embed frame's stylesheet (`data-embed.css`), printed with an
   * embed. A host that places several embeds on one page returns it for the
   * first only. Optional: the standalone page imports `data-project.css`.
   */
  frameStyles?: () => ReactNode;
};

export type DataProjectNotes = {
  /** Plain text: where the facts come from. */
  source: string;
  /** Plain text paragraphs: how the data was gathered and checked. */
  methodology: string;
};

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);

/** The attributes every Data Project root carries, standalone page and Story embed alike: what a host's enhancement script finds. */
export function dataProjectRootAttributes(resolved: ResolvedDataProject) {
  const { definition, props } = resolved;
  const { key } = definition.descriptor;
  return {
    "data-data-project": props.project.id,
    "data-data-presentation": key,
    "data-data-presentation-kind": definition.descriptor.kind,
    "data-data-source": resolved.source
  } as const;
}

/**
 * The one renderer of a presentation, shared by the standalone page, the
 * Story embed and the newsroom previews: the presentation's own stylesheet
 * hook and its server-rendered content inside `[data-data-root]`, which
 * carries the release paths `client.ts` reads. Complete without script.
 * Everything around it (headings, notes, frames) belongs to the caller.
 */
export function DataProjectPresentation({ resolved, host, headingLevel }: { resolved: ResolvedDataProject; host: DataPresentationHost; /** The level of the presentation's first internal heading: 2 beneath a page `<h1>`, 3 beneath a Story's `<h2>`. */ headingLevel: DataHeadingLevel }) {
  const { definition, props } = resolved;
  return (
    <>
      {definition.descriptor.styles ? host.styles(definition.descriptor.key) : null}
      <div className="data-project-body" data-data-root="" data-data-releases={JSON.stringify(resolved.releasePaths)}>
        {createElement(definition.Component, { ...props, headingLevel })}
      </div>
    </>
  );
}

/**
 * The standalone page frame: the project's heading and deck, the
 * presentation, and the source, methodology and "Data updated" context.
 * `client.ts`, when a presentation has one, enhances `[data-data-root]` and
 * nothing else.
 */
export function DataProjectView({ resolved, host, notes, related, kicker = "Data" }: { resolved: ResolvedDataProject; host: DataPresentationHost; notes: DataProjectNotes; related?: ReactNode; kicker?: ReactNode }) {
  const { definition, props } = resolved;
  const { key } = definition.descriptor;
  const { project, format } = props;
  const methodology = paragraphs(notes.methodology);
  return (
    <article className={`data-project data-presentation-${key}`} {...dataProjectRootAttributes(resolved)}>
      <header className="data-project-header">
        {kicker ? <p className="data-project-kicker">{kicker}</p> : null}
        <h1 className="data-project-title">{project.title}</h1>
        {project.deck ? <p className="data-project-deck">{project.deck}</p> : null}
        <p className="data-project-meta">
          <span>Data updated </span>
          <time dateTime={project.dataUpdatedAt}>{format.instant(project.dataUpdatedAt)}</time>
        </p>
      </header>
      <DataProjectPresentation resolved={resolved} host={host} headingLevel={2} />
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

/**
 * The same published Project inside a Story: the Story's own heading and
 * description, the very same presentation, and a compact source and update
 * line with a link to the full project. It repeats nothing of the standalone
 * page's frame (no page heading, no methodology, no related coverage); those
 * stay on `/data/<slug>/`. `blockId` keeps ids unique when a Story embeds
 * several projects, or one project twice.
 */
export function DataProjectEmbedView({ resolved, host, blockId, title, description, source, href, kicker = "Data" }: { resolved: ResolvedDataProject; host: DataPresentationHost; blockId: string; title: string; description: string; source: string; href: string; kicker?: ReactNode }) {
  const { definition, props } = resolved;
  const { key } = definition.descriptor;
  const { project, format } = props;
  const headingId = `${blockId}-heading`;
  return (
    <section className={`data-project-embed data-presentation-${key}`} aria-labelledby={headingId} data-data-embed="" data-data-client={definition.descriptor.client ? "" : undefined} {...dataProjectRootAttributes(resolved)}>
      {host.frameStyles?.()}
      <header className="data-project-embed-header">
        {kicker ? <p className="data-project-embed-kicker">{kicker}</p> : null}
        <h2 className="data-project-embed-title" id={headingId}>{title}</h2>
        {description ? <p className="data-project-embed-description">{description}</p> : null}
      </header>
      <DataProjectPresentation resolved={resolved} host={host} headingLevel={3} />
      <footer className="data-project-embed-notes">
        {source ? <p className="data-project-embed-source"><span>Source: </span>{source}</p> : null}
        <p className="data-project-embed-meta">
          <span>Data updated </span>
          <time dateTime={project.dataUpdatedAt}>{format.instant(project.dataUpdatedAt)}</time>
          <span aria-hidden="true"> · </span>
          <a href={href}>View full data project<span aria-hidden="true"> →</span></a>
        </p>
      </footer>
    </section>
  );
}
