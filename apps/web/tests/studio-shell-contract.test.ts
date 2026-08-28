import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Source contracts for the Studio application shell.
//
// Studio is a full-viewport visual editor, and the properties that make it one
// -- it owns the viewport, it gives the leftover height to the canvas, it
// changes nothing about wp-admin outside its own opt-in body class, and it
// always offers a way out -- are structural. They are asserted here, alongside
// the other cross-host rendering contracts, rather than left to a screenshot.

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../wordpress-plugin");
const source = (path: string) => readFileSync(join(root, path), "utf8");
const studio = source("src/studio.tsx");
const adminApp = source("src/index.tsx");
const styles = source("src/style.css");
const restRoutes = source("includes/design/rest.php");
const publicationStyles = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../packages/theme-weekly-wildcat/src/styles.css"),
  "utf8"
);

describe("Studio is a full-viewport editor", () => {
  it("mounts its own application shell rather than the admin page frame", () => {
    expect(studio).toContain('className="byline-studio-app"');
    expect(studio).toContain('height="100%"');
    // The editor route renders Studio directly; only the revisions view keeps
    // the ordinary admin chrome.
    const studioRoute = /if \(page === ADMIN_PAGE_SLUGS\.studio\) \{[\s\S]*?\n  \}/.exec(adminApp)?.[0] ?? "";
    expect(studioRoute).toContain("<BylineStudio");
    // The editor element itself is returned unwrapped; only the revisions view
    // above it still uses the admin frame.
    expect(studioRoute.slice(studioRoute.indexOf("<BylineStudio"))).not.toContain("AdminPageFrame");
  });

  it("takes the viewport and gives the remaining height to the workspace", () => {
    expect(styles).toContain("height: 100dvh");
    expect(styles).toContain("position: fixed");
    expect(styles).toMatch(/\.byline-studio-workspace \{[^}]*min-height: 0/);
    expect(styles).toMatch(/grid-template-rows: auto auto minmax\(0, 1fr\)/);
  });

  it("scopes every wp-admin change to Studio's own opt-in body class", () => {
    for (const rule of styles.split("}")) {
      if (!/#wpcontent|#wpbody|#wpfooter|#adminmenu|#wpadminbar/.test(rule)) continue;
      expect(rule).toContain("body.byline-studio-fullscreen");
    }
    expect(studio).toContain('body.classList.add("byline-studio-fullscreen")');
    expect(studio).toContain('body.classList.remove("byline-studio-fullscreen")');
  });

  it("measures a package against the published page's own box", () => {
    // The canvas mounts the real homepage shell, and the one element Puck adds
    // around each package is layout-neutral. Verified in the browser: at
    // 1280x900 every section and the whole page are pixel-identical to the
    // published render.
    expect(studio).toContain('className="byline-publication-preview live-home-shell"');
    expect(publicationStyles).toContain('.byline-publication-preview[data-byline-preview-surface="studio"] > * {');
    // The published separator sets the section's own padding-top, replacing it.
    // On the editor surface the separator is on the wrapper, so the section's
    // padding must be zeroed or the package measures taller than it renders.
    expect(publicationStyles).toContain(
      '.byline-publication-preview[data-byline-preview-surface="studio"] > *:has(section) + *:has(section) > section'
    );
    // The shell must not reintroduce a width or gap of its own.
    const root = /root: \{[\s\S]*?\n    \}/.exec(studio)?.[0] ?? "";
    expect(root).not.toMatch(/maxWidth|padding:|gap:/);
  });

  it("always offers a way out of the full-screen surface", () => {
    expect(studio).toContain("← Byline");
  });

  it("keeps the editor chrome unscaled -- only the simulated page zooms", () => {
    // Puck owns the canvas zoom. Nothing here may scale the shell itself.
    expect(studio).not.toContain("transform: `scale");
    expect(styles).not.toMatch(/\.byline-studio-(app|toolbar|panel-toggles)[^{]*\{[^}]*transform:\s*scale/);
  });
});

describe("Studio tells the truth about live versus draft", () => {
  it("separates the published design from the unpublished draft in the toolbar", () => {
    expect(studio).toContain("byline-studio-state-live");
    expect(studio).toContain("byline-studio-state-draft");
    expect(studio).toContain("Not published yet");
    expect(studio).toContain("Unpublished changes");
    expect(studio).toContain("published in Byline");
  });

  it("offers a confirmation-gated reset to the design the live site is using", () => {
    expect(studio).toContain("getFallbackDesignDocument");
    expect(studio).toContain("window.confirm");
    expect(studio).toContain('method: "DELETE"');
    // Resetting a draft must not publish, deploy, or touch content.
    const reset = /const resetToLive = async \(\) => \{[\s\S]*?\n  \};/.exec(studio)?.[0] ?? "";
    expect(reset).not.toContain("/publish");
    expect(reset).not.toContain("deployment");
  });

  it("never discards a recovered draft on its own", () => {
    // The only DELETE in the component is inside the explicit reset action.
    expect(studio.match(/method: "DELETE"/g)).toHaveLength(1);
  });

  it("exposes the draft reset as an edit-capability REST route", () => {
    expect(restRoutes).toContain("byline_rest_delete_design_autosave");
    expect(restRoutes).toContain("WP_REST_Server::DELETABLE");
    const handler = /function byline_rest_delete_design_autosave[\s\S]*?\n\}/.exec(restRoutes)?.[0] ?? "";
    expect(handler).toContain("delete_user_meta");
    // It deletes one draft and writes nothing else: no revision, no post, no
    // option, no deployment.
    expect(handler.match(/update_option|wp_insert_post|wp_update_post|update_post_meta|deployment/g)).toBeNull();
  });
});
