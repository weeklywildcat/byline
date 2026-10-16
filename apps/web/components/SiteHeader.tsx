import { getNavigation, getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();
const headerNavigation = getNavigation("header");
// Placeholder destination until the newsroom has a dedicated donation page.
const DONATE_URL = "/contact/";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-utility" aria-label="Publication details">
        <span>{publication.location.display}</span>
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

      <p className="masthead-tagline">{publication.identity.tagline}</p>

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
