/// <reference types="vite/client" />
import type { ReactNode } from "react";
import type { ArticleBlockOf } from "@byline/article-body";
import { DataProjectEmbedView, type DataPresentationHost } from "@byline/data-presentations";
import type { DataPresentationRegistry } from "@byline/data-presentations/registry";
import embedStylesheet from "../../../packages/data-presentations/src/data-embed.css?inline";
import { dataPresentationStylesheet } from "./data-presentation-host";
import { publicDataProjectById, resolvePublicDataProject } from "./public-data";

/**
 * Data Projects inside a published Story: the story's heading and description
 * around the same server-rendered presentation the project's own page uses,
 * resolved from the published Data already on disk. Nothing here can reach the
 * newsroom, and a block whose project is not in the snapshot fails the build
 * (the snapshot refuses such a Story first; this is the second lock).
 *
 * Create one renderer per page render: it prints the shared frame stylesheet
 * once and each presentation's own stylesheet once, however many embeds a
 * story places, in document order.
 */
export function createPublicDataProjectRenderer(registry: DataPresentationRegistry) {
  const printed = new Set<string>();
  let frame = false;
  const host: DataPresentationHost = {
    styles: (key): ReactNode => {
      if (printed.has(key)) return null;
      printed.add(key);
      const descriptor = registry[key]?.descriptor;
      const css = descriptor ? dataPresentationStylesheet(descriptor.kind, key) : null;
      return css ? <style data-data-presentation-styles={key} dangerouslySetInnerHTML={{ __html: css }} /> : null;
    },
    frameStyles: (): ReactNode => {
      if (frame) return null;
      frame = true;
      return <style data-data-embed-styles="" dangerouslySetInnerHTML={{ __html: embedStylesheet }} />;
    }
  };
  return (block: ArticleBlockOf<"dataProject">): ReactNode => {
    const project = block.project === null ? undefined : publicDataProjectById(block.project);
    if (!project) throw new Error(`Data Project block ${block.id} names project ${String(block.project)}, which is not published in this build.`);
    return <DataProjectEmbedView resolved={resolvePublicDataProject(project)} host={host} blockId={block.id} title={block.title} description={block.description} source={project.source} href={project.href} />;
  };
}
