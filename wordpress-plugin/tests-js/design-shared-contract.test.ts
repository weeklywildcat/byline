import { describe, expect, it } from "vitest";
import {
  BylineDesignSchemaError,
  SPECIAL_COVERAGE_PACKAGE_TYPE,
  parseBriefPackageProps,
  parseBylineDesignDocumentV2,
  parseSpecialCoveragePackageProps,
  parseStorySource
} from "@byline/design";

describe("Coverage design source contract", () => {
  it("accepts a canonical WordPress Coverage id", () => {
    expect(parseStorySource({ type: "coverage", coverageId: 42 })).toEqual({
      type: "coverage",
      coverageId: 42
    });

    expect(parseSpecialCoveragePackageProps({
      source: { type: "coverage", coverageId: 42 },
      limit: 3
    }).source).toEqual({ type: "coverage", coverageId: 42 });
  });

  it("rejects malformed or ambiguous Coverage sources", () => {
    expect(parseStorySource({ type: "coverage" })).toBeNull();
    expect(parseStorySource({ type: "coverage", coverageId: 0 })).toBeNull();
    expect(parseStorySource({ type: "coverage", coverageId: "42" })).toBeNull();
    expect(parseStorySource({ type: "coverage", coverageId: 42, slug: "special" })).toBeNull();

    expect(() => parseSpecialCoveragePackageProps({
      source: { type: "coverage", coverageId: 0 }
    })).toThrow(BylineDesignSchemaError);
    expect(() => parseBriefPackageProps({
      source: { type: "coverage", coverageId: 42, slug: "special" }
    })).toThrow(BylineDesignSchemaError);
  });

  it("validates Coverage sources inside the persisted document", () => {
    const document = {
      schemaVersion: 2,
      template: "home",
      theme: "weekly-wildcat",
      packages: [{
        id: "special-coverage",
        type: SPECIAL_COVERAGE_PACKAGE_TYPE,
        props: { source: { type: "coverage", coverageId: 42 } }
      }]
    };

    expect(parseBylineDesignDocumentV2(document, "home").packages[0].props).toEqual(document.packages[0].props);

    expect(() => parseBylineDesignDocumentV2({
      ...document,
      packages: [{
        ...document.packages[0],
        props: { source: { type: "coverage", coverageId: 0 } }
      }]
    }, "home")).toThrow(/invalid story source/);
  });
});
