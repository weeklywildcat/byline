"use client";

import { useEffect, useRef } from "react";
import { NewsletterSignupView } from "@byline/ui";
import { getPreferredSourceUrl } from "@/lib/preferred-source";
import { getPublicationConfig } from "@/lib/publication";

const kitScriptSrc = "https://weekly-wildcat.kit.com/d1eb6ce2f7/index.js";
const kitFormUid = "d1eb6ce2f7";

export function NewsletterSignupForm({
  headingId = "article-newsletter-heading",
  heading,
  showLabel = true
}: {
  headingId?: string;
  heading?: string;
  showLabel?: boolean;
}) {
  const publication = getPublicationConfig();
  const embedRef = useRef<HTMLDivElement>(null);
  const usesLegacyKitForm = publication.appearance.theme === "weekly-wildcat";

  useEffect(() => {
    if (!usesLegacyKitForm || !embedRef.current) {
      return;
    }

    embedRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.async = true;
    script.dataset.uid = kitFormUid;
    script.src = kitScriptSrc;
    embedRef.current.append(script);

    // Kit renders its own success message after a real signup. Only that counts as a sign-up: opening or
    // submitting the form unsuccessfully never does. Reported once per page.
    const host = embedRef.current;
    let reported = false;
    const watch = new MutationObserver(() => {
      const success = host.querySelector(".formkit-alert-success");
      if (!reported && success && success.textContent?.trim()) {
        reported = true;
        window.dispatchEvent(new CustomEvent("byline:signup", { detail: { method: "newsletter" } }));
        watch.disconnect();
      }
    });
    watch.observe(host, { childList: true, subtree: true, characterData: true });

    return () => {
      watch.disconnect();
      script.remove();
    };
  }, [usesLegacyKitForm]);

  if (!publication.features.newsletter) {
    return null;
  }

  return (
    <NewsletterSignupView
      headingId={headingId}
      heading={heading ?? `Get ${publication.identity.shortName} in your inbox`}
      showLabel={showLabel}
      embedRef={embedRef}
      fallbackLink={usesLegacyKitForm ? null : { href: publication.urls.contact, label: "Ask about newsletter subscriptions" }}
      preferredSource={{ href: getPreferredSourceUrl(publication.urls.publicSite), label: `Add ${publication.identity.shortName} as a preferred source on Google` }}
    />
  );
}
