import { describe, expect, it } from "vitest";
import { safeError } from "../src/errors";
describe("safe error contract", () => {
  it("redacts untrusted messages and stack traces", () => {
    const safe=safeError(new Error("password=PRIVATE token=SECRET"),"request");
    expect(safe).toMatchObject({code:"internal_error"});
    expect(JSON.stringify(safe)).not.toMatch(/PRIVATE|SECRET|stack/);
  });
});
