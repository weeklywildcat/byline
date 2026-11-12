import siteConfig from "@byline/site/config";
import { SiteSpikeInteractives } from "./SiteSpikeInteractives";

// Phase 0 spike: the newsroom renders site-owned preview code. Not linked from anywhere.
export default function SiteSpikePage() {
  return (
    <main data-site-spike={siteConfig.id}>
      <h1>{siteConfig.publication.name}</h1>
      <SiteSpikeInteractives />
    </main>
  );
}
