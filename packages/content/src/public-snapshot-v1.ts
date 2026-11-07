/**
 * The existing WordPress build input used by the WordPress static build.
 * The Payload newsroom has a separate native public snapshot contract.
 */
export const PUBLIC_BUILD_SNAPSHOT_SCHEMA_VERSION = 1;

export const PUBLIC_BUILD_SNAPSHOT_DATASETS = ["posts", "authors", "guests", "categories", "tags", "pages", "corrections", "coverages", "schoolEvents", "attachments"] as const;
export type PublicBuildSnapshotDataset = (typeof PUBLIC_BUILD_SNAPSHOT_DATASETS)[number];

export class InvalidBuildSnapshotError extends Error {
  constructor(detail: string) {
    super(`Invalid Byline build snapshot: ${detail}`);
    this.name = "InvalidBuildSnapshotError";
  }
}

function record(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function requireCondition(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new InvalidBuildSnapshotError(detail);
}
function rendered(value: unknown) {
  return record(value) && typeof value.rendered === "string";
}

/**
 * Validates a v1 snapshot's envelope, publication, every required dataset,
 * counts, IDs, public status, and required shapes. Throws `InvalidBuildSnapshotError`; returns the value unchanged.
 */
export function validatePublicBuildSnapshotV1<T = unknown>(value: unknown): T {
  requireCondition(record(value), "expected an object");
  requireCondition(value.schemaVersion === PUBLIC_BUILD_SNAPSHOT_SCHEMA_VERSION, "unsupported schemaVersion");
  requireCondition(Number.isSafeInteger(value.revision) && value.revision >= 0, "invalid revision");
  requireCondition(typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)), "invalid generatedAt");
  requireCondition(typeof value.sourceTimezone === "string", "missing sourceTimezone");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value.sourceTimezone });
  } catch {
    requireCondition(false, "invalid sourceTimezone");
  }
  const publication = value.publication;
  requireCondition(record(publication) && publication.schemaVersion === 1 && publication.revision === value.revision, "publication/revision missing or inconsistent");
  for (const name of ["identity", "location", "urls", "branding", "appearance", "features", "licensing", "seo"]) {
    requireCondition(record(publication[name]), `publication.${name} missing`);
  }
  for (const name of ["navigation", "sections", "social"]) requireCondition(Array.isArray(publication[name]), `publication.${name} missing`);
  requireCondition(typeof publication.locale === "string" && typeof publication.timezone === "string", "publication locale/timezone missing");
  for (const [group, fields] of Object.entries({ identity: ["name", "shortName", "description", "organizationName", "tagline"], location: ["display", "city", "region", "country", "address"], licensing: ["copyrightNotice", "imageLicenseUrl", "acquireLicensePage"], seo: ["defaultTitle", "defaultDescription", "organizationType"] })) {
    for (const field of fields) requireCondition(typeof publication[group][field] === "string", `publication.${group}.${field} missing`);
  }
  requireCondition(Array.isArray(publication.branding.icons), "publication.branding.icons missing");
  for (const name of ["masthead", "logo", "organizationLogo", "defaultSocialImage"]) {
    requireCondition(record(publication.branding[name]) && typeof publication.branding[name].url === "string" && typeof publication.branding[name].alt === "string", `publication.branding.${name} missing`);
  }
  requireCondition(typeof publication.appearance.theme === "string" && (record(publication.appearance.tokenOverrides) || (Array.isArray(publication.appearance.tokenOverrides) && publication.appearance.tokenOverrides.length === 0)), "publication.appearance incomplete");
  for (const key of ["cms", "publicSite"]) requireCondition(typeof publication.urls[key] === "string" && /^https?:\/\//.test(publication.urls[key]), `publication.urls.${key} missing`);
  requireCondition(record(value.datasets) && record(value.counts), "datasets/counts missing");
  for (const name of PUBLIC_BUILD_SNAPSHOT_DATASETS) {
    const rows = value.datasets[name];
    requireCondition(Array.isArray(rows), `required dataset ${name} missing`);
    requireCondition(value.counts[name] === rows.length, `count mismatch for ${name}`);
    const ids = new Set<string>();
    for (const row of rows) {
      requireCondition(record(row) && (typeof row.id === "string" || Number.isSafeInteger(row.id)), `${name}: invalid row/id`);
      requireCondition(!ids.has(String(row.id)), `${name}: duplicate id ${row.id}`);
      ids.add(String(row.id));
      if (["posts", "pages"].includes(name)) {
        requireCondition(typeof row.slug === "string" && row.slug.length && rendered(row.title) && rendered(row.content) && rendered(row.excerpt), `${name}: incomplete rendered content`);
        requireCondition(typeof row.date === "string" && typeof row.modified === "string", `${name}: missing timestamps`);
        requireCondition(!row.content.protected && !row.title.protected && (!row.status || row.status === "publish"), `${name}: non-public record`);
      }
      if (name === "posts") requireCondition(row.status === "publish" && row.type === "post" && Array.isArray(row.categories) && Array.isArray(row.tags) && record(row._embedded), "posts: incomplete public relationships");
      if (["authors", "guests", "categories", "tags"].includes(name)) requireCondition(typeof row.name === "string" && typeof row.slug === "string", `${name}: missing name/slug`);
      if (name === "attachments") {
        requireCondition(typeof row.source_url === "string" && record(row.media_details), "attachments: missing media metadata");
        requireCondition(row.bylineImage?.artDirection == null || record(row.bylineImage.artDirection), "attachments: invalid art direction");
      }
      if (name === "schoolEvents") requireCondition(typeof row.startDate === "string" && typeof row.endDate === "string" && typeof row.title === "string" && typeof row.allDay === "boolean" && record(row.display) && typeof row.display.date === "string" && typeof row.display.time === "string", "schoolEvents: incomplete event");
      if (name === "coverages") requireCondition(typeof row.slug === "string" && typeof row.title === "string" && Array.isArray(row.stories), "coverages: incomplete collection");
      if (name === "corrections") requireCondition(typeof row.text === "string" && typeof row.type === "string" && typeof row.date === "string", "corrections: incomplete correction");
    }
  }
  return value as T;
}
