"use client";

import type { ArticleBlockOf } from "@byline/article-body";
import type { DataProjectChoice } from "@byline/editor/data-project";
import { DataProjectFigure } from "@byline/ui/article-body";
import { useEffect, useState } from "react";
import { DataProjectEmbedFrame } from "./DataProjectEmbedFrame";

/**
 * A Data Project in Story Live Preview: the story's own heading and
 * description around the project's real presentation, with its publication
 * state stated plainly. Readers get the published version, so that is what is
 * drawn whenever there is one; a draft-only project is labelled as such.
 */
export function PreviewDataProject({ block, timeZone, locale }: { block: ArticleBlockOf<"dataProject">; timeZone: string; locale: string }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; project: DataProjectChoice } | { status: "missing" }>({ status: "loading" });
  useEffect(() => {
    if (block.project === null) return;
    const controller = new AbortController();
    fetch(`/api/byline/data/projects/${String(block.project)}/choice`, { credentials: "include", signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => setState(response.ok ? { status: "ready", project: ((await response.json()) as { project: DataProjectChoice }).project } : { status: "missing" }))
      .catch(() => (controller.signal.aborted ? undefined : setState({ status: "missing" })));
    return () => controller.abort();
  }, [block.project]);

  const project = state.status === "ready" ? state.project : null;
  const formatDate = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(iso));
  return (
    <DataProjectFigure
      headingId={`${block.id}-heading`}
      publication={project?.publication}
      title={block.title}
      description={block.description}
      footer={project ? (
        <>
          {project.dataUpdatedAt ? <span>Data updated <time dateTime={project.dataUpdatedAt}>{formatDate(project.dataUpdatedAt)}</time></span> : null}
          {project.publicUrl ? <a href={project.publicUrl}>View full data project</a> : null}
        </>
      ) : undefined}
    >
      {state.status === "missing" ? <p role="alert" data-data-preview-state="missing">This Data Project is no longer available. Choose another before publishing.</p> : null}
      {project?.publication === "draft" ? <p role="note" data-data-preview-state="draft"><strong>Draft Data Project · not yet publishable.</strong> Publish it before publishing this story.</p> : null}
      {project?.publication === "changed" ? <p role="note" data-data-preview-state="changed">This project has unpublished changes. Readers will see its published version.</p> : null}
      {project ? <DataProjectEmbedFrame projectId={project.id} source={project.publication === "draft" ? "working" : "published"} title={`${block.title}: ${project.presentation.name}`} version={project.dataUpdatedAt ?? undefined} /> : null}
    </DataProjectFigure>
  );
}
