"use client";

import { useEffect, useRef } from "react";

const kitScriptSrc = "https://weekly-wildcat.kit.com/d1eb6ce2f7/index.js";
const kitFormUid = "d1eb6ce2f7";

export function NewsletterSignupForm() {
  const embedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embedRef.current) {
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
  }, []);

  return (
    <aside className="article-newsletter-signup" aria-labelledby="article-newsletter-heading">
      <div className="article-newsletter-copy">
        <p className="article-newsletter-kicker">Newsletter</p>
        <h2 id="article-newsletter-heading">Get the Weekly Wildcat in your Inbox</h2>
        <p>Catch the newest stories, scores, and campus updates when they publish.</p>
      </div>

      <div className="article-newsletter-kit" ref={embedRef} />
    </aside>
  );
}
