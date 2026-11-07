import type { CSSProperties } from "react";
import { getNavigation, getPublicationConfig } from "@/lib/publication";
import { BEHIND_THE_SCENES } from "@/lib/behind-the-scenes";

const publication = getPublicationConfig();
const footerLinks = getNavigation("footer");
if (!footerLinks.some((link) => link.url === BEHIND_THE_SCENES.path)) {
  footerLinks.push({ label: BEHIND_THE_SCENES.name, url: BEHIND_THE_SCENES.path, locations: ["footer"], group: "About" });
}
const footerGroups = Object.entries(
  footerLinks.reduce<Record<string, ReturnType<typeof getNavigation>>>(
    (groups, item) => {
      const group = item.group || "More";
      groups[group] = [...(groups[group] ?? []), item];
      return groups;
    },
    {}
  )
).map(([title, links]) => ({ title, links }));

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand-row">
          <a className="footer-logo" href="/" aria-label={`${publication.identity.name} home`}>
            <span
              aria-hidden="true"
              style={{ "--footer-logo-url": `url(${JSON.stringify(publication.branding.logo.url)})` } as CSSProperties}
            />
          </a>

          <div className="footer-meta">
            <p>{publication.identity.tagline}</p>
            <address>{publication.location.address}</address>
            <a href={publication.urls.contact}>Contact</a>
          </div>
        </div>

        <div className="footer-link-groups">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={`Footer ${group.title}`} className="footer-link-group">
              <h2>{group.title}</h2>
              <div className="footer-links">
                {group.links.map((link) => (
                  <a key={`${link.label}-${link.url}`} href={link.url}>
                    {link.label}
                  </a>
                ))}
              </div>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}
