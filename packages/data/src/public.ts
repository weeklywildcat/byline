import { z } from "zod";
import { DATASET_KEY_PATTERN } from "./fields";
import { dataReleaseDescriptorSchema, type DataReleaseDescriptor } from "./release";
import { PRESENTATION_KEY_PATTERN, normalizeSettings, projectBindingSchema, validateBindings, type DataPresentationDescriptor, type ProjectSettings } from "./presentation";
import { canonicalJson } from "./release";

/**
 * The public face of Byline Data inside a build snapshot (Snapshot v3's
 * `data`): published Projects and the descriptors of exactly the releases
 * they use. Row data is never here; it lives in the content-addressed release
 * artifacts the descriptors name, which the build acquires and verifies.
 */

export const PUBLIC_DATA_ROUTE = "/data/";

export type PublicDataBinding = { slot: string; dataset: string; release: string; fields: Record<string, string> };

export type PublicDataProject = {
  id: number;
  slug: string;
  title: string;
  deck: string;
  href: string;
  presentation: { kind: "template" | "custom"; key: string };
  settings: ProjectSettings;
  bindings: PublicDataBinding[];
  /** Where the facts come from, as plain text. */
  source: string;
  /** How the data was gathered and checked, as plain text paragraphs. */
  methodology: string;
  indexing: "public" | "noindex";
  publishedAt: string;
  modifiedAt: string;
  /** The newest release this project uses: the reader-facing "Data updated" date. */
  dataUpdatedAt: string;
  /** Published Stories about this project, in editor order. */
  relatedStories: number[];
};

export type PublicDataSection = { projects: PublicDataProject[]; releases: DataReleaseDescriptor[] };

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const instant = z.iso.datetime({ offset: true });
export const publicDataProjectSchema = z.strictObject({
  id: z.number().int().positive(),
  slug,
  title: z.string().min(1).max(200),
  deck: z.string().max(600),
  href: z.string().regex(/^\/data\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/),
  presentation: z.strictObject({ kind: z.enum(["template", "custom"]), key: z.string().regex(PRESENTATION_KEY_PATTERN).max(64) }),
  settings: z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean()])),
  bindings: z.array(projectBindingSchema.extend({ release: z.string().regex(/^[0-9a-f]{64}$/) })).min(1).max(8),
  source: z.string().max(600),
  methodology: z.string().max(5000),
  indexing: z.enum(["public", "noindex"]),
  publishedAt: instant,
  modifiedAt: instant,
  dataUpdatedAt: instant,
  relatedStories: z.array(z.number().int().positive()).max(12)
});
export const publicDataSectionSchema = z.strictObject({
  projects: z.array(publicDataProjectSchema).max(500),
  releases: z.array(dataReleaseDescriptorSchema).max(2000)
});

export function emptyPublicDataSection(): PublicDataSection {
  return { projects: [], releases: [] };
}

export const dataProjectPath = (slugValue: string) => `/data/${slugValue}/`;

export type PublicDataValidationOptions = {
  /** The registered presentation for a key, or undefined. Unknown keys fail closed. */
  presentation?: (key: string) => DataPresentationDescriptor | undefined;
  /** Whether a Story ID is in the same snapshot. */
  story?: (id: number) => boolean;
  /** Claims a public path; throws on a duplicate. */
  claim?: (path: string) => void;
};

/**
 * Runtime invariants beyond the closed shape: unique IDs, slugs and routes;
 * every binding names a release in the section and only that release's public
 * fields; no release that no project uses; the presentation is registered and
 * the bindings and settings satisfy it; related Stories are public.
 */
export function validatePublicDataSection(value: unknown, options: PublicDataValidationOptions = {}): PublicDataSection {
  const parsed = publicDataSectionSchema.safeParse(value);
  const fail = (detail: string): never => {
    throw new Error(`Invalid Byline Data section: ${detail}`);
  };
  if (!parsed.success) fail(parsed.error!.issues.slice(0, 6).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  const section = parsed.data as PublicDataSection;
  const releases = new Map<string, DataReleaseDescriptor>();
  for (const release of section.releases) {
    if (releases.has(release.sha256)) fail(`release ${release.sha256} is listed twice`);
    if (release.fields.some((entry) => entry.visibility !== "public")) fail(`release ${release.sha256} carries a private field`);
    if (!DATASET_KEY_PATTERN.test(release.dataset)) fail(`release ${release.sha256} has an invalid dataset key`);
    releases.set(release.sha256, release);
  }
  const used = new Set<string>();
  const ids = new Set<number>();
  const slugs = new Set<string>();
  for (const project of section.projects) {
    const name = `Data project ${project.id}`;
    if (ids.has(project.id)) fail(`${name} is listed twice`);
    ids.add(project.id);
    if (slugs.has(project.slug)) fail(`two Data projects use the slug ${project.slug}`);
    slugs.add(project.slug);
    if (project.href !== dataProjectPath(project.slug)) fail(`${name} has an invalid route`);
    options.claim?.(project.href);
    const datasets = new Map<string, DataReleaseDescriptor>();
    let newest = "";
    for (const binding of project.bindings) {
      const release = releases.get(binding.release);
      if (!release) fail(`${name} uses a release that isn't in the snapshot`);
      if (release!.dataset !== binding.dataset) fail(`${name} binds ${binding.slot} to a release of another dataset`);
      if (datasets.has(binding.dataset) && datasets.get(binding.dataset)!.sha256 !== release!.sha256) fail(`${name} uses two releases of ${binding.dataset}`);
      datasets.set(binding.dataset, release!);
      used.add(release!.sha256);
      if (release!.releasedAt > newest) newest = release!.releasedAt;
    }
    if (Date.parse(project.dataUpdatedAt) !== Date.parse(newest)) fail(`${name} has an inconsistent data update time`);
    if (options.presentation) {
      const descriptor = options.presentation(project.presentation.key);
      if (!descriptor) fail(`${name} uses the unregistered presentation ${project.presentation.key}`);
      if (descriptor!.kind !== project.presentation.kind) fail(`${name} names presentation ${project.presentation.key} as a ${project.presentation.kind}`);
      const issues = validateBindings(descriptor!, project.bindings, (key) => datasets.get(key)?.fields, { requirePublic: true });
      if (issues.length) fail(`${name} has incompatible bindings: ${issues.map((issue) => issue.message).join(" ")}`);
      const settings = normalizeSettings(descriptor!, project.settings);
      if (settings.issues.length || canonicalJson(settings.settings) !== canonicalJson(project.settings)) fail(`${name} has invalid settings for ${project.presentation.key}`);
    }
    if (options.story) for (const id of project.relatedStories) if (!options.story(id)) fail(`${name} relates Story ${id}, which is not public`);
    if (new Set(project.relatedStories).size !== project.relatedStories.length) fail(`${name} relates a Story twice`);
  }
  for (const sha of releases.keys()) if (!used.has(sha)) fail(`release ${sha} is not used by any project`);
  return section;
}

/**
 * The article-embed contract prepared for the follow-up `dataProject` body
 * block: a stable Project reference plus article-facing text, never copied
 * rows. The same published Project and releases render the standalone page
 * and the embed.
 */
export type DataProjectEmbedReference = { project: number; title: string; description: string };
