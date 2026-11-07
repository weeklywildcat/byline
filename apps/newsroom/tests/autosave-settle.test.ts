import { describe, expect, it } from "vitest";
import { autosaveLeftNothingUnsaved, sameFormValue } from "../src/ui/story/autosave-settle";

const body = (text: string) => ({ root: { children: [{ type: "paragraph", children: [{ type: "text", text }] }], type: "root" } });
const start = { values: { headline: "Title", body: body("Hello"), updatedAt: "2026-11-06T10:00:00.000Z" }, savedAt: 1000 };

describe("autosave settling (Payload leaves `modified` set after a no-op touch mid-save)", () => {
  it("clears a modified flag when the save succeeded and the data is what it started with", () => {
    // Payload's updatedAt moves on every save, and the server may reorder JSON keys.
    const end = { values: { body: body("Hello"), headline: "Title", updatedAt: "2026-11-06T10:00:02.000Z" }, savedAt: 3000 };
    expect(autosaveLeftNothingUnsaved(start, end, true)).toBe(true);
  });

  it("keeps an edit made while the save ran unsaved, for the next autosave", () => {
    const end = { values: { headline: "Title", body: body("Hello!"), updatedAt: "2026-11-06T10:00:02.000Z" }, savedAt: 3000 };
    expect(autosaveLeftNothingUnsaved(start, end, true)).toBe(false);
  });

  it("never clears after a failed autosave: Payload keeps the form modified on purpose", () => {
    const end = { values: start.values, savedAt: start.savedAt };
    expect(autosaveLeftNothingUnsaved(start, end, true)).toBe(false);
  });

  it("has nothing to settle when the form is not modified", () => {
    const end = { values: start.values, savedAt: 3000 };
    expect(autosaveLeftNothingUnsaved(start, end, false)).toBe(false);
  });

  it("compares nested values structurally and treats an absent key as undefined", () => {
    expect(sameFormValue({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] })).toBe(true);
    expect(sameFormValue({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameFormValue({ a: [] }, { a: {} })).toBe(false);
    expect(sameFormValue({ a: null }, { a: undefined })).toBe(false);
  });
});
