import { describe, expect, it } from "vitest";

import { createPlanningFetchers, type PlanningRequestOptions } from "../src/planning/planning-api";
import { describeMediaDeskError, MEDIA_FEATURED_IN_USE_CODE } from "../src/planning/media-desk-errors";
import {
  mergeMediaAttachmentIds,
  normalizeMediaAttachmentIds,
  removeMediaAttachmentId
} from "../src/planning/planning-model";

describe("Media Desk attachment workflow", () => {
  it("normalizes link and unlink selections without duplicating Media IDs", () => {
    expect(normalizeMediaAttachmentIds([7, "7", { id: 8 }, { attachmentId: 8 }, 0, "bad"])).toEqual([7, 8]);
    expect(mergeMediaAttachmentIds([7], [{ id: 8 }, 7])).toEqual([7, 8]);
    expect(removeMediaAttachmentId([7, 8, 7], 7)).toEqual([8]);
  });

  it("keeps link, unlink, featured, and completion writes on the protected legacy route", async () => {
    const requests: PlanningRequestOptions[] = [];
    const api = createPlanningFetchers(async <T>(options: PlanningRequestOptions): Promise<T> => {
      requests.push(options);
      return {} as T;
    });

    await api.updateMediaRequest?.(42, { attachmentIds: [7, 8] });
    await api.updateMediaRequest?.(42, { attachmentIds: [7] });
    await api.updateMediaRequest?.(42, { featuredAttachmentId: 7 });
    await api.updateMediaRequest?.(42, { status: "done" });

    expect(requests.map(({ path, method, data }) => ({ path, method, data }))).toEqual([
      { path: "/byline/v1/admin/media/42", method: "POST", data: { attachmentIds: [7, 8] } },
      { path: "/byline/v1/admin/media/42", method: "POST", data: { attachmentIds: [7] } },
      { path: "/byline/v1/admin/media/42", method: "POST", data: { featuredAttachmentId: 7 } },
      { path: "/byline/v1/admin/media/42", method: "POST", data: { status: "done" } }
    ]);
  });

  it("turns the featured-image conflict into a specific, actionable UI message", () => {
    expect(describeMediaDeskError({ code: MEDIA_FEATURED_IN_USE_CODE, message: "Conflict" })).toBe(
      "This image is the story's featured image. Choose another featured image or remove it as featured before unlinking it from the story."
    );
    expect(describeMediaDeskError({ code: MEDIA_FEATURED_IN_USE_CODE })).toContain("Choose another featured image");
    expect(describeMediaDeskError({ code: "other_error", message: "Other media failure" })).toBe("Other media failure");
  });
});
