// The published-design envelope, and the schema capability model.
//
// One constant cannot mean both "the schema we write" and "the schemas we can
// read": during the v1 -> v2 transition those are deliberately different. A
// published design is therefore parsed *by* its schema version rather than being
// checked against a single number, and a v2 document is never obtained by
// casting a v1 one.
import { BylineDesignCompatibilityError } from "./errors";
import { migrateDesignDocumentV1ToV2 } from "./migrate";
import { parseBylineDesignDocumentV2, type BylineDesignDocumentV2 } from "./schema-v2";

// What Studio persists and what the frontend renders from.
export const BYLINE_DESIGN_WRITE_SCHEMA_VERSION = 2;

// What the frontend can still load. v1 remains readable for older published
// records; Studio and package consumers normalise it, while the published page
// deliberately keeps the old renderer live for visible blocks not yet modeled.
export const BYLINE_DESIGN_READ_SCHEMA_VERSIONS = [1, 2] as const;

export type BylineDesignReadSchemaVersion = (typeof BYLINE_DESIGN_READ_SCHEMA_VERSIONS)[number];

export function canReadDesignSchema(version: unknown): version is BylineDesignReadSchemaVersion {
  return (BYLINE_DESIGN_READ_SCHEMA_VERSIONS as readonly number[]).includes(version as number);
}

// The legacy Puck-shaped document. Retained for reading and migration only.
export type BylineDesignDocumentV1 = {
  schemaVersion: 1;
  template: string;
  theme: string;
  editor: {
    engine: "puck";
    version: string;
  };
  layout: {
    root: Record<string, unknown>;
    content: Array<{ type: string; props: Record<string, unknown> }>;
  };
  baseRevisionId?: number;
  modifiedAt?: string;
};

// Kept as the historical name so existing imports keep working.
export type BylineDesignDocument = BylineDesignDocumentV1;

export type BylineDesignDocumentAnyVersion = BylineDesignDocumentV1 | BylineDesignDocumentV2;

type PublishedDesignEnvelope = {
  revision: number;
  modifiedAt: string | null;
};

// A real discriminated union, so `schemaVersion === 1` narrows `document` to the
// v1 shape. A caller therefore cannot reach into `document.layout` on something
// that might be v2, or hand a v1 document to a package renderer, without the
// compiler stopping them.
export type PublishedBylineDesign =
  | (PublishedDesignEnvelope & { schemaVersion: 1; document: BylineDesignDocumentV1 })
  | (PublishedDesignEnvelope & { schemaVersion: 2; document: BylineDesignDocumentV2 });

function parseV1Document(document: Record<string, unknown>, template: string): BylineDesignDocumentV1 {
  const editor = document.editor as Record<string, unknown> | undefined;
  const layout = document.layout as Record<string, unknown> | undefined;

  if (document.template !== template || typeof document.theme !== "string") {
    throw new BylineDesignCompatibilityError(`Published design ${template} has mismatched template or theme identity.`);
  }
  if (editor?.engine !== "puck" || typeof editor.version !== "string") {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an unsupported editor contract.`);
  }
  if (!layout || !layout.root || typeof layout.root !== "object" || !Array.isArray(layout.content)) {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an invalid layout.`);
  }

  return document as unknown as BylineDesignDocumentV1;
}

export function parsePublishedBylineDesign(value: unknown, template: string): PublishedBylineDesign {
  if (!value || typeof value !== "object") {
    throw new BylineDesignCompatibilityError(`Published design ${template} is missing or malformed.`);
  }

  const published = value as Record<string, unknown>;
  const document = published.document as Record<string, unknown> | undefined;
  const schemaVersion = document?.schemaVersion;

  if (!canReadDesignSchema(schemaVersion)) {
    throw new BylineDesignCompatibilityError(
      `Published design ${template} uses unsupported schema ${String(schemaVersion ?? "unknown")}; this frontend reads schema ${BYLINE_DESIGN_READ_SCHEMA_VERSIONS.join(" and ")}.`
    );
  }
  if (typeof published.revision !== "number" || !Number.isInteger(published.revision) || published.revision < 0) {
    throw new BylineDesignCompatibilityError(`Published design ${template} has an invalid revision.`);
  }

  const modifiedAt = typeof published.modifiedAt === "string" ? published.modifiedAt : null;

  // Parsed by version. A malformed v2 document fails loudly here rather than
  // silently falling back to a seed, which would hide a broken publish.
  if (schemaVersion === 2) {
    return {
      document: parseBylineDesignDocumentV2(document, template),
      schemaVersion: 2,
      revision: published.revision,
      modifiedAt
    };
  }

  return {
    document: parseV1Document(document as Record<string, unknown>, template),
    schemaVersion: 1,
    revision: published.revision,
    modifiedAt
  };
}

export type ResolvedPublishedDesign = {
  document: BylineDesignDocumentV2;
  revision: number;
  modifiedAt: string | null;
  // Populated when a v1 document was migrated on read, so a build log or Studio
  // can surface what did not convert.
  migrationWarnings: string[];
};

/**
 * Normalises a readable published design to schema 2.
 *
 * The only supported route from a stored v1 design to something the package
 * renderers will accept -- v2 is never produced by casting.
 *
 * Studio and package-based consumers call this path. The published homepage
 * also retains a direct v1 fallback until every visible v1 block, including
 * divider, has a faithful package representation; unsupported data remains in
 * `legacy` rather than being dropped.
 */
export function resolvePublishedDesignToV2(
  published: PublishedBylineDesign,
  template: string
): ResolvedPublishedDesign {
  if (published.schemaVersion === 2) {
    return {
      document: published.document,
      revision: published.revision,
      modifiedAt: published.modifiedAt,
      migrationWarnings: []
    };
  }

  const { document, warnings } = migrateDesignDocumentV1ToV2(published.document, template);

  return {
    // Validate the generated document as well as the stored one. This catches
    // duplicate manual pins introduced by a legacy layout before the published
    // resolver can render them twice.
    document: parseBylineDesignDocumentV2(document, template),
    revision: published.revision,
    modifiedAt: published.modifiedAt,
    migrationWarnings: warnings
  };
}
