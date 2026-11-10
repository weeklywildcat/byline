import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyPublicDataSection, parseReleaseBytes, validatePublicDataSection, type DataRelease, type PublicDataProject, type PublicDataSection } from "@byline/data";
import { resolveDataProject, type ResolvedDataProject } from "@byline/data-presentations";
import { publicDataPresentationRegistry } from "./native-snapshot";
import { getPublicationConfig } from "./publication";

/**
 * Byline Data at render time: the validated data section and the release
 * files the build materialized before Astro ran (lib/data-releases.ts).
 * Everything is local and verified again on read; nothing here can reach the
 * newsroom. A missing or altered file fails the build.
 */
let section: PublicDataSection | undefined;
export function publicDataSection(): PublicDataSection {
  if (section) return section;
  const file = process.env.BYLINE_PREPARED_DATA_FILE;
  if (!file) return (section = emptyPublicDataSection());
  const registry = publicDataPresentationRegistry();
  return (section = validatePublicDataSection(JSON.parse(readFileSync(file, "utf8")), {
    presentation: (key) => (Object.hasOwn(registry, key) ? registry[key].descriptor : undefined)
  }));
}

const releases = new Map<string, DataRelease>();
export function publicDataRelease(sha256: string): DataRelease {
  const cached = releases.get(sha256);
  if (cached) return cached;
  const descriptor = publicDataSection().releases.find((entry) => entry.sha256 === sha256);
  const directory = process.env.BYLINE_PREPARED_DATA_DIR;
  if (!descriptor || !directory) throw new Error(`Data release ${sha256.slice(0, 12)}… is not part of this build.`);
  const bytes = readFileSync(path.join(directory, `${sha256}.json`));
  if (bytes.byteLength !== descriptor.bytes || createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error(`Data release ${sha256.slice(0, 12)}… changed after it was verified.`);
  const release = parseReleaseBytes(bytes.toString("utf8"));
  releases.set(sha256, release);
  return release;
}

export function publicDataProjects(): PublicDataProject[] {
  return publicDataSection().projects;
}

export function publicDataProject(slug: string): PublicDataProject | undefined {
  return publicDataProjects().find((project) => project.slug === slug);
}

/** A published Data Project by its stable ID (what a Story's Data Project block names). */
export function publicDataProjectById(id: number | string): PublicDataProject | undefined {
  return publicDataProjects().find((project) => String(project.id) === String(id));
}

/** A public project's presentation, resolved from its published releases only. Unresolvable projects fail the build. */
export function resolvePublicDataProject(project: PublicDataProject): ResolvedDataProject {
  const registry = publicDataPresentationRegistry();
  const definition = Object.hasOwn(registry, project.presentation.key) ? registry[project.presentation.key] : undefined;
  const publication = getPublicationConfig();
  const outcome = resolveDataProject(definition, {
    source: "published",
    project,
    releases: new Map(project.bindings.map((binding) => [binding.release, publicDataRelease(binding.release)]))
  }, { locale: publication.locale, timeZone: publication.timezone });
  if (!outcome.ok) throw new Error(`Data project ${project.slug} can't be rendered: ${outcome.issues.join(" ")}`);
  return outcome.resolved;
}
