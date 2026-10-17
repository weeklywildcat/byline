import { getNavigation, getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();
const headerNavigation = getNavigation("header");
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
  // "nav" pins the section nav (homepage); "logo" pins and shrinks the masthead
  // logo (articles). Both lift the header's children into the body so
  // position: sticky can last the whole page.
  sticky?: "nav" | "logo";
  // The masthead date is the day the site was built, not a story date. Article
  // pages leave it out so the only date a crawler finds there is the story's.
  showDate?: boolean;
  // The homepage has no headline of its own, so its masthead is the page's h1.
  homepage?: boolean;
};

export function SiteHeader({ sticky, showDate = true, homepage = false }: SiteHeaderProps) {
  const mastheadImage = <img src={publication.branding.masthead.url} alt={publication.branding.masthead.alt} />;

  return (
    <header className={sticky ? `site-header site-header--flat site-header--${sticky}` : "site-header"}>
      <div className={showDate ? "site-utility" : "site-utility site-utility--undated"} aria-label="Publication details">
        <span>{publication.location.display}</span>
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
          <a href="/">{mastheadImage}</a>
        </h1>
      ) : (
        <a className="masthead-logo" href="/" aria-label={`${publication.identity.name} home`}>
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
