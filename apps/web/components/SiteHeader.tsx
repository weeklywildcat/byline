import { StoryNavigation } from "@byline/ui";
import { getNavigation, getPublicationConfig } from "@/lib/publication";
import { THE_PROWLER } from "@/lib/the-prowler";

const publication = getPublicationConfig();
const headerNavigation = getNavigation("header");
// The menu's secondary links come from the same configuration: the footer's "About" group, never a second hard-coded list.
const secondaryNavigation = getNavigation("footer").filter((item) => item.group === "About");
// The compact menu keeps the About links short: Diversity & Inclusion stays in the footer only.
const menuSecondaryNavigation = secondaryNavigation.filter((item) => item.url !== "/diversity-inclusion/");
// Placeholder destination until the newsroom has a dedicated donation page.
const DONATE_URL = "/contact/";
const headerNow = new Date();
const headerDate = new Intl.DateTimeFormat(publication.locale, {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: publication.timezone
}).format(headerNow);

const dateParts = new Intl.DateTimeFormat(publication.locale, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: publication.timezone
}).formatToParts(headerNow);

const dateTime = `${dateParts.find((part) => part.type === "year")?.value}-${
  dateParts.find((part) => part.type === "month")?.value
}-${dateParts.find((part) => part.type === "day")?.value}`;

type SiteHeaderProps = {
  // "standard" is the publication header. "story-overlay" is the Minimal site navigation
  // a visually led story asks for: menu, logo and search over the story opening, and none
  // of the utility strip, masthead or section row. The layout chooses it before render.
  mode?: "standard" | "story-overlay";
  // Where the minimal bar's logo sits on a wide screen; the layout chooses it from the story's opening.
  logoAlign?: "center" | "start";
  // "nav" pins the section nav (homepage); "logo" pins and shrinks the masthead
  // logo (articles). Both lift the header's children into the body so
  // position: sticky can last the whole page.
  sticky?: "nav" | "logo";
  // The masthead date is the day the site was built, not a story date. Article
  // pages leave it out so the only date a crawler finds there is the story's.
  showDate?: boolean;
  // The homepage has no headline of its own, so its masthead is the page's h1.
  // The Prowler's section page uses the same rule for its own wordmark.
  homepage?: boolean;
  // "prowler" swaps in The Prowler wordmark on the satire section and its
  // stories; the utility strip then links back to the publication's homepage.
  masthead?: "publication" | "prowler";
};

export function SiteHeader({ mode = "standard", logoAlign = "center", sticky, showDate = true, homepage = false, masthead = "publication" }: SiteHeaderProps) {
  const prowler = masthead === "prowler";
  const brand = prowler
    ? { name: THE_PROWLER.name, href: THE_PROWLER.path, logoUrl: THE_PROWLER.logo.src, alt: THE_PROWLER.name }
    : { name: publication.identity.name, href: "/", logoUrl: publication.branding.masthead.url, alt: publication.branding.masthead.alt };
  if (mode === "story-overlay") {
    return (
      <StoryNavigation
        logoAlign={logoAlign}
        publicationName={brand.name}
        homeHref={brand.href}
        logoUrl={brand.logoUrl}
        sections={headerNavigation.map(({ label, url }) => ({ label, url }))}
        secondary={menuSecondaryNavigation.map(({ label, url }) => ({ label, url }))}
      />
    );
  }
  const mastheadImage = <img src={brand.logoUrl} alt={brand.alt} />;
  const headerClass = [
    "site-header",
    sticky ? `site-header--flat site-header--${sticky}` : "",
    prowler ? "site-header--prowler" : ""
  ].filter(Boolean).join(" ");

  return (
    <header className={headerClass}>
      <div className={showDate ? "site-utility" : "site-utility site-utility--undated"} aria-label="Publication details">
        {prowler
          ? <a className="site-utility-home" href="/">{publication.identity.name}</a>
          : <span>{publication.location.display}</span>}
        {showDate ? <time dateTime={dateTime}>{headerDate}</time> : null}
        <div className="header-tools" aria-label="Site tools">
          <a className="header-donate" href={DONATE_URL}>
            Donate
          </a>
          <a className="search-button" href="/search/" aria-label="Search" title="Search (press /)">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </a>
        </div>
      </div>

      {sticky === "logo" ? <div className="sticky-logo-bar" data-sticky-logo-bar aria-hidden="true" /> : null}
      {homepage ? (
        <h1 className="masthead-logo">
          <a href={brand.href}>{mastheadImage}</a>
        </h1>
      ) : (
        <a className="masthead-logo" href={brand.href} aria-label={prowler ? THE_PROWLER.name : `${publication.identity.name} home`}>
          {mastheadImage}
        </a>
      )}

      <nav aria-label="Sections" className="section-nav">
        {headerNavigation.map((section) => (
          <a key={`${section.label}-${section.url}`} href={section.url}>
            {section.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
