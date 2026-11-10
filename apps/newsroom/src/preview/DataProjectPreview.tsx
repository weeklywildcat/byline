import { type DataRelease, type ProjectBinding } from "@byline/data";
import { DataProjectView, resolveDataProject, type PublishedDataInput, type WorkingDataInput } from "@byline/data-presentations";
import { createLocalReq, type Payload } from "payload";
import { relationIds } from "../access/user";
import { storedRelease } from "../data/collections";
import { dataPresentationsForServer } from "../data/registry";
import { loadCurrentRelease, workingRelease } from "../data/releases";
import { loadPreviewPublication } from "./publication";
import { DataPreviewAssets } from "./data-assets";

/**
 * The Data project preview, server-rendered with the SAME resolver and
 * `DataProjectView` as the static page. The two sources are distinct inputs
 * (`resolveDataProject`): working data is built in memory from the rows as
 * the signed-in account reads them and is never stored; published data is
 * exactly the immutable releases the public page uses.
 */
export async function DataProjectPreview({ payload, user, projectId, source }: { payload: Payload; user: unknown; projectId: number; source: "working" | "published" }) {
  const req = await createLocalReq({ user: { ...(user as object), collection: "users" } as never }, payload);
  const asUser = { req, overrideAccess: false as const, depth: 0 };
  const project = await payload.findByID({ collection: "data-projects", id: projectId, draft: true, ...asUser }).catch(() => null);
  if (!project) return <Message title="This project isn't available">It may have been deleted, or your account can't read it.</Message>;
  const publication = await loadPreviewPublication(payload);
  const bindings = (Array.isArray(project.bindings) ? project.bindings : []) as ProjectBinding[];
  const keys = [...new Set(bindings.map((binding) => binding.dataset))];
  const datasets = keys.length ? (await payload.find({ collection: "data-datasets", where: { key: { in: keys } }, pagination: false, ...asUser })).docs : [];
  const releases = new Map<string, DataRelease>();
  try {
    for (const dataset of datasets) {
      const release = source === "working"
        ? await workingRelease(req, { id: dataset.id, key: dataset.key, title: dataset.title, description: dataset.description, schema: dataset.schema, workingRevision: dataset.workingRevision }, { includePrivate: true })
        : await loadCurrentRelease(payload, storedRelease(dataset.release));
      if (release) releases.set(source === "working" ? dataset.key : storedRelease(dataset.release)!.descriptor.sha256, release);
    }
  } catch (error) {
    return <Message title="The data couldn't be prepared">{(error as Error).message}</Message>;
  }
  const registry = dataPresentationsForServer();
  const definition = Object.hasOwn(registry, project.presentation) ? registry[project.presentation] : undefined;
  const base = { id: project.id, title: project.title, deck: project.deck ?? "", slug: project.slug, presentation: { kind: project.presentationKind, key: project.presentation }, settings: project.settings };
  const input: WorkingDataInput | PublishedDataInput = source === "working"
    ? { source: "working", project: { ...base, bindings }, releases }
    : {
        source: "published",
        releases,
        project: {
          ...base, href: `/data/${project.slug}/`, settings: (project.settings ?? {}) as never, source: project.source ?? "", methodology: project.methodology ?? "", indexing: project.indexing,
          publishedAt: project.publishedAt ?? project.createdAt, modifiedAt: project.updatedAt, relatedStories: [],
          dataUpdatedAt: [...releases.values()].map((release) => release.releasedAt).sort().at(-1) ?? project.updatedAt,
          bindings: bindings.flatMap((binding) => {
            const pointer = storedRelease(datasets.find((dataset) => dataset.key === binding.dataset)?.release);
            return pointer ? [{ ...binding, release: pointer.descriptor.sha256 }] : [];
          })
        }
      };
  if (source === "published" && input.project.bindings.length !== bindings.length) return <Message title="Nothing is published yet">Publish the datasets this project uses to preview exactly what readers will get.</Message>;
  const outcome = resolveDataProject(definition, input, { locale: publication.locale, timeZone: publication.timeZone });
  if (!outcome.ok) return <Message title="The preview can't be shown yet">{outcome.issues.join(" ")}</Message>;
  const related = relationIds(project.relatedStories).length
    ? (await payload.find({ collection: "stories", where: { id: { in: relationIds(project.relatedStories) } }, draft: false, pagination: false, select: { headline: true, _status: true }, ...asUser })).docs.filter((story) => story._status === "published")
    : [];
  return (
    <main className="byline-preview-page byline-publication-preview" data-data-preview={source}>
      {source === "working" ? <p className="byline-preview-stale" role="note">Working data · not what readers see yet</p> : null}
      <div style={{ padding: "0 20px" }}>
        <DataProjectView
          resolved={outcome.resolved}
          host={{ styles: () => null }}
          notes={{ source: project.source ?? "", methodology: project.methodology ?? "" }}
          related={related.length ? (
            <section className="data-project-related" aria-labelledby="data-related">
              <h2 id="data-related">Related coverage</h2>
              <ul>{related.map((story) => <li key={story.id}><span>{story.headline}</span></li>)}</ul>
            </section>
          ) : undefined}
        />
      </div>
      <DataPreviewAssets presentation={outcome.resolved.definition.descriptor.key} kind={outcome.resolved.definition.descriptor.kind} styles={outcome.resolved.definition.descriptor.styles} client={outcome.resolved.definition.descriptor.client} />
    </main>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="byline-preview-message">
      <h1>{title}</h1>
      <p>{children}</p>
    </main>
  );
}
