import { describe, expect, it } from "vitest";
import { normalizeDonationEmail } from "../src/collections/DonationWaitlist";

describe("donation waitlist email normalization", () => {
  it("normalizes ordinary email addresses", () => {
    expect(normalizeDonationEmail("  Reader@Example.COM ")).toBe("reader@example.com");
  });

  it.each(["", "not-an-email", "reader@", "@example.com", "reader @example.com"])("rejects invalid email %j", (email) => {
    expect(() => normalizeDonationEmail(email)).toThrow("Enter a valid email address.");
  });
});
