import { describe, expect, it } from "vitest";

import { createPlanningFetchers, type PlanningRequestOptions } from "../src/planning/planning-api";
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
});
