import { getNavigation, getPublicationConfig } from "@/lib/publication";
import { SiteIcon } from "./SiteIcon";

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

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-utility" aria-label="Publication details">
        <span>{publication.location.display}</span>
        <time dateTime={dateTime}>{headerDate}</time>
        <div className="header-tools" aria-label="Site tools">
        <a className="header-donate" href={DONATE_URL}>
          Donate
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12h15M13 6l6 6-6 6" />
          </svg>
        </a>
          <a className="search-button" href="/search/" aria-label="Search">
            <SiteIcon name="ph:magnifying-glass" width={17} height={17} />
          </a>
        </div>
      </div>

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
