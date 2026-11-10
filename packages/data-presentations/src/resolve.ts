import {
  bindSlot,
  normalizeSettings,
  validateBindings,
  type BindingIssue,
  type BoundSlot,
  type DataRelease,
  type ProjectBinding,
  type ProjectSettings,
  type PublicDataProject
} from "@byline/data";
import { createDataFormatter, runPrepare, type DataFormatter, type DataPresentationDefinition, type DataPresentationProps, type DataSourceKind } from "./sdk";

/**
 * Turns a project and its releases into a presentation's props. The two
 * sources are distinct types on purpose:
 *
 *   published  a public project (Snapshot v3) and the verified, immutable
 *              releases its bindings name by SHA-256. The only input the
 *              public site can construct.
 *   working    a newsroom draft and releases built in memory from working
 *              records. Newsroom preview only; never written anywhere.
 *
 * Both render through the same component, so the preview is the public page.
 */

export type WorkingDataProject = {
  id: number;
  title: string;
  deck: string;
  slug: string;
  presentation: { kind: "template" | "custom"; key: string };
  settings: unknown;
  bindings: ProjectBinding[];
};

export type PublishedDataInput = { source: "published"; project: PublicDataProject; releases: ReadonlyMap<string, DataRelease> };
export type WorkingDataInput = { source: "working"; project: WorkingDataProject; releases: ReadonlyMap<string, DataRelease> };

export type ResolvedDataProject = {
  definition: DataPresentationDefinition;
  props: DataPresentationProps<any, any, any>;
  source: DataSourceKind;
  /** Slot → the public path of its release bytes (published only), for client enhancement. */
  releasePaths: Record<string, string>;
};

export type ResolveOutcome = { ok: true; resolved: ResolvedDataProject } | { ok: false; issues: string[] };

export function resolveDataProject(definition: DataPresentationDefinition | undefined, input: PublishedDataInput | WorkingDataInput, options: { locale: string; timeZone: string }): ResolveOutcome {
  const { project } = input;
  if (!definition) return { ok: false, issues: [`The presentation "${project.presentation.key}" isn't registered in this build.`] };
  const { descriptor } = definition;
  if (descriptor.kind !== project.presentation.kind) return { ok: false, issues: [`"${descriptor.key}" is a ${descriptor.kind}, not a ${project.presentation.kind}.`] };
  const releaseFor = (binding: ProjectBinding & { release?: string }) => (input.source === "published" ? input.releases.get(binding.release ?? "") : input.releases.get(binding.dataset));
  const missing = project.bindings.filter((binding) => !releaseFor(binding));
  if (missing.length) return { ok: false, issues: missing.map((binding) => `No ${input.source === "published" ? "published release" : "working data"} for ${binding.dataset}.`) };
  const byDataset = new Map(project.bindings.map((binding) => [binding.dataset, releaseFor(binding)!]));
  const bindingIssues: BindingIssue[] = validateBindings(descriptor, project.bindings, (key) => byDataset.get(key)?.fields, { requirePublic: input.source === "published" });
  const { settings, issues: settingIssues } = normalizeSettings(descriptor, project.settings);
  const issues = [...bindingIssues.map((issue) => issue.message), ...settingIssues];
  if (issues.length) return { ok: false, issues };
  const data: Record<string, BoundSlot | null> = {};
  const releasePaths: Record<string, string> = {};
  for (const slotDescriptor of descriptor.slots) {
    const binding = project.bindings.find((entry) => entry.slot === slotDescriptor.key);
    if (!binding) {
      data[slotDescriptor.key] = null;
      continue;
    }
    data[slotDescriptor.key] = bindSlot(slotDescriptor, binding, releaseFor(binding)!);
    if (input.source === "published") releasePaths[slotDescriptor.key] = `/_byline/data/${(binding as unknown as { release: string }).release}.json`;
  }
  const format: DataFormatter = createDataFormatter(options);
  const releases = [...byDataset.values()];
  const dataUpdatedAt = input.source === "published" ? input.project.dataUpdatedAt : releases.map((release) => release.releasedAt).sort().at(-1) ?? new Date(0).toISOString();
  let model: unknown;
  try {
    model = runPrepare(definition, { data: data as never, settings: settings as ProjectSettings, format });
  } catch (error) {
    return { ok: false, issues: [(error as Error).message] };
  }
  return {
    ok: true,
    resolved: {
      definition,
      source: input.source,
      releasePaths,
      props: {
        project: { id: project.id, title: project.title, deck: project.deck, href: `/data/${project.slug}/`, settings, dataUpdatedAt, source: input.source },
        data,
        model,
        format,
        releasePaths
      }
    }
  };
}
