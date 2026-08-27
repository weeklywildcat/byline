import type { ReactNode } from "react";
import { packageSectionId } from "./package-dom";

export type ResolvedNewsletterPackage = {
  packageId: string;
  enabled: boolean;
  label: string;
  heading: string;
  presentation: { showLabel: boolean };
};

export type NewsletterPackageProps = {
  package: ResolvedNewsletterPackage;
  formSlot?: ReactNode;
};

export function NewsletterPackage({ package: resolved, formSlot }: NewsletterPackageProps) {
  if (!resolved.enabled || !formSlot) return null;

  return (
    <section
      id={packageSectionId(resolved.packageId, "home-newsletter")}
      className="home-newsletter-section"
      aria-label={resolved.label}
    >
      {formSlot}
    </section>
  );
}
