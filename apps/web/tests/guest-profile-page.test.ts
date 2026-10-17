import { describe, expect, it } from "vitest";

import {
  contributorHasProfilePage,
  normalizeGuestContributor
} from "@/lib/wordpress";

const base = { type: "guest", id: 9, name: "Alex Smith", slug: "alex-smith", role: "Photographer" };

describe("guest contributors without a profile page", () => {
  it("treats guests that predate the option as having a page", () => {
    const guest = normalizeGuestContributor(base);

    expect(guest?.hasProfilePage).toBeUndefined();
    expect(guest && contributorHasProfilePage(guest)).toBe(true);
  });

  it("marks one-off guests so bylines render them without a link", () => {
    const guest = normalizeGuestContributor({ ...base, hasProfilePage: false });

    expect(guest?.hasProfilePage).toBe(false);
    expect(guest && contributorHasProfilePage(guest)).toBe(false);
  });

  it("keeps an explicit page for guests that opted in", () => {
    const guest = normalizeGuestContributor({ ...base, hasProfilePage: true });

    expect(guest && contributorHasProfilePage(guest)).toBe(true);
  });
});
