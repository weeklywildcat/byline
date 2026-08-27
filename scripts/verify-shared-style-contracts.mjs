import { readFile } from "node:fs/promises";
import postcss from "postcss";

const sharedPath = "packages/theme-weekly-wildcat/src/styles.css";
const globalsPath = "apps/web/app/globals.css";
const sharedCss = await readFile(sharedPath, "utf8");
const globalsCss = await readFile(globalsPath, "utf8");
const sharedRoot = postcss.parse(sharedCss, { from: sharedPath });
const globalsRoot = postcss.parse(globalsCss, { from: globalsPath });
const scope = ".byline-publication-preview";

const requiredClasses = [
  "byline-package-empty-state",
  "top-stories-layout",
  "live-lead",
  "top-stories-rail",
  "top-stories-left-rail",
  "right-now-list",
  "home-story",
  "home-story-image",
  "home-story-body",
  "home-story-meta",
  "home-story-category",
  "home-story-deck",
  "home-story-author",
  "home-story-read-link",
  "home-story-lead",
  "home-story-briefing",
  "home-story-field",
  "homepage-poll-card",
  "homepage-poll-heading",
  "this-week-card",
  "this-week-header",
  "this-week-list",
  "this-week-item",
  "from-field",
  "section-header-row",
  "field-layout",
  "field-rail",
  "sports-athlete-feature",
  "sports-athlete-image",
  "sports-athlete-body",
  "field-schedule",
  "field-schedule-layout",
  "field-result-card",
  "field-scoreboard",
  "field-score-team",
  "field-upcoming-game"
];

for (const className of requiredClasses) {
  if (!sharedCss.includes(`.${className}`)) {
    throw new Error(`Shared package stylesheet is missing .${className}.`);
  }
}

sharedRoot.walkRules((rule) => {
  for (const selector of postcss.list.comma(rule.selector)) {
    if (!selector.includes(scope)) {
      throw new Error(`Publication style is not scoped to ${scope}: ${selector}`);
    }
  }
});

const sharedClassPattern = /\.(?:top-stories[\w-]*|live-lead|right-now-list|home-story[\w-]*|homepage-poll[\w-]*|this-week[\w-]*|from-field|section-header-row|field-[\w-]*|sports-athlete[\w-]*)/;
globalsRoot.walkRules((rule) => {
  if (sharedClassPattern.test(rule.selector)) {
    throw new Error(`Shared package selector still has a second definition in ${globalsPath}: ${rule.selector}`);
  }
});

const webLayout = await readFile("apps/web/app/layout.tsx", "utf8");
const webHomepage = await readFile("apps/web/app/page.tsx", "utf8");
const studioEntry = await readFile("wordpress-plugin/src/index.tsx", "utf8");
const studio = await readFile("wordpress-plugin/src/studio.tsx", "utf8");
const adminApp = await readFile("wordpress-plugin/includes/admin/app.php", "utf8");
const leadPackage = await readFile("packages/ui/src/LeadPackage.tsx", "utf8");
const editorialLeadPackage = await readFile("packages/ui/src/EditorialLeadPackage.tsx", "utf8");

for (const [host, source] of [["frontend", webLayout], ["Studio", studioEntry]]) {
  if (!source.includes('@byline/theme-weekly-wildcat/styles.css')) {
    throw new Error(`${host} does not consume the canonical Weekly Wildcat package stylesheet.`);
  }
}

if (!webHomepage.includes("byline-publication-preview") || !studio.includes("byline-publication-preview")) {
  throw new Error("Both production and Studio must mount shared packages inside the publication style scope.");
}
if (!leadPackage.includes('className="byline-package-empty-state"')
  || !editorialLeadPackage.includes('className="byline-package-empty-state"')
  || !globalsCss.includes(".empty-state {")) {
  throw new Error("Package and app-page empty-state contracts must remain separate.");
}
if (sharedCss.includes("html[data-byline-theme")) {
  throw new Error("Shared theme variants must use the publication root's data-theme attribute across document boundaries.");
}
if (!studio.includes("overrides={{ iframe: iframeOverride }}")
  || !studio.includes("createPortal")
  || !studio.includes("document.head")
  || !studio.includes("syncHostStyles: false")) {
  throw new Error("Studio must load publication styles through Puck's supported iframe override without mirroring host CSS.");
}
if (!adminApp.includes("'previewStylesheetUrl' => plugins_url('build/index.css'")) {
  throw new Error("WordPress does not expose the built shared stylesheet URL to the Puck iframe.");
}

console.log("Shared package CSS ownership, scoping, host loading, and Puck iframe contracts verified.");
