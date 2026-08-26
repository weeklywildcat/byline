export const BYLINE_PROTOCOL_VERSION = 1 as const;
export const BYLINE_DESIGN_SCHEMA_VERSION = 1 as const;
export const BYLINE_THEME_API_VERSION = 1 as const;

export type BylineProtocolManifest = {
  protocolVersion: number;
  pluginVersion: string;
  publicationSchemaVersion: number;
  designSchemaVersion: number;
  themeApiVersion: number;
};

export class BylineCompatibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BylineCompatibilityError";
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function parseBylineProtocolManifest(value: unknown): BylineProtocolManifest {
  if (!value || typeof value !== "object") {
    throw new BylineCompatibilityError("The Byline plugin returned an invalid protocol manifest.");
  }

  const manifest = value as Record<string, unknown>;

  if (
    !isPositiveInteger(manifest.protocolVersion) ||
    typeof manifest.pluginVersion !== "string" ||
    manifest.pluginVersion.trim() === "" ||
    !isPositiveInteger(manifest.publicationSchemaVersion) ||
    !isPositiveInteger(manifest.designSchemaVersion) ||
    !isPositiveInteger(manifest.themeApiVersion)
  ) {
    throw new BylineCompatibilityError("The Byline plugin protocol manifest is missing required version fields.");
  }

  return {
    protocolVersion: manifest.protocolVersion,
    pluginVersion: manifest.pluginVersion,
    publicationSchemaVersion: manifest.publicationSchemaVersion,
    designSchemaVersion: manifest.designSchemaVersion,
    themeApiVersion: manifest.themeApiVersion
  };
}

export function assertBylineProtocolCompatibility(value: unknown): BylineProtocolManifest {
  const manifest = parseBylineProtocolManifest(value);
  const mismatches: string[] = [];

  if (manifest.protocolVersion !== BYLINE_PROTOCOL_VERSION) {
    mismatches.push(`protocol ${manifest.protocolVersion} (frontend supports ${BYLINE_PROTOCOL_VERSION})`);
  }
  if (manifest.publicationSchemaVersion !== 1) {
    mismatches.push(`publication schema ${manifest.publicationSchemaVersion} (frontend supports 1)`);
  }
  if (manifest.designSchemaVersion !== BYLINE_DESIGN_SCHEMA_VERSION) {
    mismatches.push(
      `design schema ${manifest.designSchemaVersion} (frontend supports ${BYLINE_DESIGN_SCHEMA_VERSION})`
    );
  }
  if (manifest.themeApiVersion !== BYLINE_THEME_API_VERSION) {
    mismatches.push(`theme API ${manifest.themeApiVersion} (frontend supports ${BYLINE_THEME_API_VERSION})`);
  }

  if (mismatches.length > 0) {
    throw new BylineCompatibilityError(
      `This static build is incompatible with the connected Byline plugin: ${mismatches.join(", ")}. ` +
        "Update the plugin and frontend to compatible releases before publishing."
    );
  }

  return manifest;
}
