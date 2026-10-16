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
};

export function SiteHeader({ sticky }: SiteHeaderProps) {
  return (
    <header className={sticky ? `site-header site-header--flat site-header--${sticky}` : "site-header"}>
      <div className="site-utility" aria-label="Publication details">
        <span>{publication.location.display}</span>
        <time dateTime={dateTime}>{headerDate}</time>
        <div className="header-tools" aria-label="Site tools">
          <a className="header-donate" href={DONATE_URL}>
            Donate
          </a>
          <a className="search-button" href="/search/" aria-label="Search">
            <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </a>
        </div>
      </div>

      {sticky === "logo" ? <div className="sticky-logo-bar" data-sticky-logo-bar aria-hidden="true" /> : null}
      <a className="masthead-logo" href="/" aria-label={`${publication.identity.name} home`}>
        <img src={publication.branding.masthead.url} alt={publication.branding.masthead.alt} />
      </a>

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
