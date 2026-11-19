import { DEFAULT_EMAIL_BRAND, renderEmail, type EmailBrand } from "./email-layout";

/** How long a reset link works (Payload's `forgotPassword.expiration`). */
export const PASSWORD_RESET_EXPIRATION_MS = 60 * 60 * 1000;

/** The password reset email Payload sends from "Forgot password?", in the shared Byline layout. */
export function passwordResetEmail(input: { resetUrl: string; email: string; name?: string | null; brand?: EmailBrand; dateline?: string | null }) {
  const subject = "Reset your Byline password";
  const minutes = Math.round(PASSWORD_RESET_EXPIRATION_MS / 60_000);
  const expires = minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? "" : "s"}` : `${minutes} minutes`;
  const { html, text } = renderEmail({
    brand: input.brand ?? DEFAULT_EMAIL_BRAND,
    dateline: input.dateline,
    preheader: `The link works for ${expires}. If you didn't ask for it, you can ignore this email.`,
    kicker: "Your account",
    title: input.name ? `${input.name.split(/\s+/)[0]}, reset your password` : subject,
    lead: "Someone asked to reset the password for your Byline account. If it was you, choose a new one below.",
    details: [{ label: "Account", value: input.email }],
    action: { label: "Choose a new password", href: input.resetUrl },
    note: `The link works once and expires in ${expires}. If you didn't ask for this, ignore this email: your password stays the same.`,
    reason: "You're getting this because a password reset was requested for this address on Byline. Only someone with access to this inbox can use the link."
  });
  return { subject, html, text };
}
