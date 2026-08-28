import { Button } from "@wordpress/components";
import { __ } from "@wordpress/i18n";
import { useState } from "@wordpress/element";

import type { NewsletterFetchers } from "./api";
import { NewsletterEditor } from "./NewsletterEditor";
import { NewsletterList } from "./NewsletterList";
import { NewsletterSettings } from "./NewsletterSettings";
import type { NewsletterBranding } from "./render";

export type NewsletterAppView = "list" | "editor" | "settings";

export type NewsletterAppProps = {
  fetchers: NewsletterFetchers;
  branding: NewsletterBranding;
  initialView?: NewsletterAppView;
  initialNewsletterId?: number;
};

/**
 * Optional host-level shell.  It intentionally has no WordPress root or route
 * assumptions, so an existing admin entrypoint can choose whether to render
 * this shell or mount the individual views in its own navigation.
 */
export function NewsletterApp({ fetchers, branding, initialView = "list", initialNewsletterId }: NewsletterAppProps) {
  const [view, setView] = useState<NewsletterAppView>(initialView);
  const [newsletterId, setNewsletterId] = useState<number | undefined>(initialNewsletterId);

  const openList = () => setView("list");
  const openEditor = (id?: number) => {
    setNewsletterId(id);
    setView("editor");
  };

  return (
    <div className="byline-newsletter-app">
      <nav className="byline-newsletter-nav" aria-label={__("Newsletter navigation", "weekly-wildcat-headless")}>
        <Button variant={view === "list" ? "primary" : "secondary"} aria-current={view === "list" ? "page" : undefined} onClick={openList}>{__("Issues", "weekly-wildcat-headless")}</Button>
        <Button variant={view === "settings" ? "primary" : "secondary"} aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>{__("Settings", "weekly-wildcat-headless")}</Button>
        {view === "editor" ? <span className="byline-newsletter-nav-current" aria-current="page">{__("Editor", "weekly-wildcat-headless")}</span> : null}
      </nav>

      {view === "list" ? <NewsletterList fetchers={fetchers} onOpen={openEditor} onCreate={() => openEditor()} /> : null}
      {view === "settings" ? <NewsletterSettings fetchers={fetchers} /> : null}
      {view === "editor" ? <NewsletterEditor fetchers={fetchers} newsletterId={newsletterId} branding={branding} onBack={openList} onSaved={(newsletter) => setNewsletterId(newsletter.id)} /> : null}
    </div>
  );
}
