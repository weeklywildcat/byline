import { describe, expect, it } from "vitest";
import { passwordResetEmail } from "../src/domain/account-email";

describe("password reset email", () => {
  it("links the reset page, names the account and says when the link expires", () => {
    const message = passwordResetEmail({ resetUrl: "https://newsroom.test/admin/reset/abc123", email: "ada@example.test", name: "Ada Lovelace" });
    expect(message.subject).toBe("Reset your Byline password");
    expect(message.html).toContain('href="https://newsroom.test/admin/reset/abc123"');
    expect(message.html).toContain("Ada, reset your password");
    expect(message.html).toContain("ada@example.test");
    expect(message.text).toContain("expires in 1 hour");
    expect(message.text).toContain("Choose a new password: https://newsroom.test/admin/reset/abc123");
  });
});
