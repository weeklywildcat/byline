import { PUBLIC_SECTIONS } from "@/lib/sections";
import { SiteIcon } from "./SiteIcon";

const headerNow = new Date();
const headerDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York"
}).format(headerNow);

const dateParts = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/New_York"
}).formatToParts(headerNow);

const dateTime = `${dateParts.find((part) => part.type === "year")?.value}-${
  dateParts.find((part) => part.type === "month")?.value
}-${dateParts.find((part) => part.type === "day")?.value}`;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-utility" aria-label="Publication details">
        <span>Ninety Six, S.C.</span>
        <time dateTime={dateTime}>{headerDate}</time>
        <div className="header-tools" aria-label="Site tools">
          <button className="search-button" type="button" aria-label="Search">
            <SiteIcon name="ph:magnifying-glass" width={17} height={17} />
          </button>
        </div>
      </div>

      <a className="masthead-logo" href="/" aria-label="Weekly Wildcat home">
        <img src="/brand/weekly-wildcat-wide-logo.svg" alt="Weekly Wildcat" />
      </a>

      <nav aria-label="Sections" className="section-nav">
        {PUBLIC_SECTIONS.map((section) => (
          <a key={section.slug} href={section.href}>
            {section.name}
          </a>
        ))}
      </nav>
    </header>
  );
}
