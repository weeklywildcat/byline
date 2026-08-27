"use client";

import { useEffect, useRef } from "react";
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

    return () => {
      script.remove();
    };
  }, [usesLegacyKitForm]);

  if (!publication.features.newsletter) {
    return null;
  }

  return (
    <aside className="article-newsletter-signup" aria-labelledby={headingId}>
      <div className="article-newsletter-copy">
        {showLabel ? <p className="article-newsletter-kicker">Newsletter</p> : null}
        <h2 id={headingId}>{heading ?? `Get ${publication.identity.shortName} in your inbox`}</h2>
        <p>Catch the newest stories, scores, and campus updates when they publish.</p>
      </div>

      {usesLegacyKitForm ? <div className="article-newsletter-kit" ref={embedRef} /> : (
        <a className="article-newsletter-generic-link" href={publication.urls.contact}>Ask about newsletter subscriptions</a>
      )}
    </aside>
  );
}
