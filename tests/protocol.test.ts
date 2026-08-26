import { describe, expect, it } from "vitest";
import {
  assertBylineProtocolCompatibility,
  BYLINE_DESIGN_SCHEMA_VERSION,
  BYLINE_PROTOCOL_VERSION,
  BYLINE_THEME_API_VERSION,
  BylineCompatibilityError,
  parseBylineProtocolManifest
} from "@/lib/protocol";

const compatibleManifest = {
  protocolVersion: BYLINE_PROTOCOL_VERSION,
  pluginVersion: "0.2.0",
  publicationSchemaVersion: 1,
  designSchemaVersion: BYLINE_DESIGN_SCHEMA_VERSION,
  themeApiVersion: BYLINE_THEME_API_VERSION
};

describe("Byline protocol compatibility", () => {
  it("accepts the supported plugin, schema, and theme API versions", () => {
    expect(assertBylineProtocolCompatibility(compatibleManifest)).toEqual(compatibleManifest);
  });

  it("rejects malformed manifests before a build can continue", () => {
    expect(() => parseBylineProtocolManifest({ protocolVersion: 1 })).toThrow(BylineCompatibilityError);
  });

  it("reports every incompatible public contract", () => {
    expect(() =>
      assertBylineProtocolCompatibility({
        ...compatibleManifest,
        protocolVersion: 2,
        publicationSchemaVersion: 2,
        designSchemaVersion: 3,
        themeApiVersion: 4
      })
    ).toThrow(/protocol 2.*publication schema 2.*design schema 3.*theme API 4/i);
  });
});
