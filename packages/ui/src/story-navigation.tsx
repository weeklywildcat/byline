import type { ReactNode } from "react";

/**
 * Minimal site navigation for a visually led story: menu, logo and search over
 * the story opening, and nothing else of the normal site header.
 *
 * Presentational and hook-free, so the public Astro site and the newsroom's
 * Live Preview render the same markup. The layout (never the article) decides
 * to render it, from the story's resolved Site navigation choice, before the
 * article is rendered; `startStoryNavigation` (./story-navigation-client)
 * wires the menu and the transparent-to-solid transition.
 *
 * Layers, all `position: fixed` and non-interactive except their controls:
 *  1. a solid publication-surface layer, invisible while the story opening is
 *     behind the bar;
 *  2. the menu button (left);
 *  3. the logo, centred, in its own blend layer: `mix-blend-mode` needs its
 *     own stacking context directly against the page, so it cannot share a
 *     layer with the buttons;
 *  4. the search link (right).
 *
 * The menu is a native modal `<dialog>` styled as a left sheet, which gives
 * focus trapping, Escape, an inert page behind it and focus restoration
 * without a UI library on the static site.
 */
export type StoryNavigationLink = { label: string; url: string };

export type StoryNavigationProps = {
  /** "Weekly Wildcat": the accessible name of the logo link and the menu. */
  publicationName: string;
  /** The masthead artwork. One dark asset serves every background: it is inverted to white for the blend. */
  logoUrl: string;
  /** Where the logo and the menu header link. The public site root; an absolute URL in Live Preview. */
  homeHref?: string;
  /** The configured header sections, from `getNavigation("header")`. */
  sections: readonly StoryNavigationLink[];
  /** Appropriate secondary publication links. Not a copy of the footer. */
  secondary?: readonly StoryNavigationLink[];
  /** The existing search surface. */
  searchHref?: string;
  /**
   * Where the logo sits on a wide screen. "start" puts it beside the menu, for an opening whose seam
   * is mid-viewport (Split); phones and tablets always centre it. Decided by the layout, from the opening.
   */
  logoAlign?: "center" | "start";
  className?: string;
};

function MenuIcon(): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function StoryNavigation({ publicationName, logoUrl, homeHref = "/", sections, secondary = [], searchHref = "/search/", logoAlign = "center", className }: StoryNavigationProps): ReactNode {
  return (
    <header className={["story-nav", className].filter(Boolean).join(" ")} data-story-nav data-solid="false" data-logo-align={logoAlign}>
      <div className="story-nav__surface" aria-hidden="true" />

      <div className="story-nav__layer story-nav__layer--start">
        <button type="button" className="story-nav__control" aria-label="Open site navigation" aria-haspopup="dialog" aria-expanded="false" aria-controls="story-nav-menu" data-story-nav-open>
          <MenuIcon />
        </button>
      </div>

      <div className="story-nav__layer story-nav__layer--logo">
        <a className="story-nav__logo" href={homeHref} aria-label={`${publicationName} home`}>
          <img className="story-nav__logo-mark" src={logoUrl} alt="" aria-hidden="true" decoding="async" />
        </a>
      </div>

      <div className="story-nav__layer story-nav__layer--end">
        <a className="story-nav__control" href={searchHref} aria-label={`Search ${publicationName}`}>
          <SearchIcon />
        </a>
      </div>

      <dialog className="story-nav__sheet" id="story-nav-menu" aria-labelledby="story-nav-menu-title" data-story-nav-sheet>
        <div className="story-nav__sheet-header">
          <a className="story-nav__sheet-title" id="story-nav-menu-title" href={homeHref}>{publicationName}</a>
          <form method="dialog">
            <button type="submit" className="story-nav__control story-nav__control--plain" aria-label="Close site navigation" data-story-nav-close>
              <CloseIcon />
            </button>
          </form>
        </div>
        <nav aria-label="Site sections" className="story-nav__sheet-nav">
          <ul className="story-nav__sections">
            {sections.map((section) => (
              <li key={`${section.label}-${section.url}`}><a href={section.url}>{section.label}</a></li>
            ))}
          </ul>
          {secondary.length > 0 ? (
            <ul className="story-nav__secondary" aria-label="More from the publication">
              {secondary.map((link) => (
                <li key={`${link.label}-${link.url}`}><a href={link.url}>{link.label}</a></li>
              ))}
            </ul>
          ) : null}
        </nav>
      </dialog>
      <noscript>
        <style>{`.story-nav__surface{opacity:1!important}.story-nav [data-story-nav-open]{display:none}`}</style>
      </noscript>
    </header>
  );
}
