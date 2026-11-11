import { defineSiteConfig } from "@byline/site-contract";

// Plain data. No JSX, CSS or .astro imports: the Payload CLI loads this under plain Node.
export default defineSiteConfig({
  id: "weekly-wildcat",
  contractVersion: 1,
  requiresByline: { min: 1, max: 1 },
  publication: { name: "Weekly Wildcat", theme: "weekly-wildcat" },
  pages: [
    { pattern: "/spike-site-page/", entry: "./pages/spike.astro" },
    { pattern: "/about/", entry: "./pages/about.astro" }
  ],
  routes: { about: false },
  assets: "./public",
  interactives: [{ id: "spike-counter", kind: "interactive", title: "Spike counter" }]
});
