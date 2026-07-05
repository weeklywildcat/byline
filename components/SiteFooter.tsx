const footerGroups = [
  {
    title: "Columns",
    links: [
      { name: "News", href: "/category/news/" },
      { name: "Features", href: "/category/features/" },
      { name: "Opinion", href: "/category/opinion/" },
      { name: "Arts & Culture", href: "/category/culture/" },
      { name: "Sports", href: "/sports/" }
    ]
  },
  {
    title: "Policies",
    links: [
      { name: "Terms & Service", href: "/terms/" },
      { name: "Privacy Policy", href: "/privacy/" }
    ]
  },
  {
    title: "About",
    links: [
      { name: "About us", href: "/about/" },
      { name: "Media Kit", href: "/media-kit/" },
      { name: "Advertise with Us", href: "/advertise/" },
      { name: "Join our team", href: "/join/" },
      { name: "Leadership", href: "/leadership/" },
      { name: "Diversity & Inclusion", href: "/diversity-inclusion/" }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="footer-brand-row">
          <a className="footer-logo" href="/" aria-label="Weekly Wildcat home">
            <span aria-hidden="true" />
          </a>

          <div className="footer-meta">
            <p>Ninety Six High School&apos;s Official Student Newspaper</p>
            <address>640 South Cambridge Street, Ninety Six, SC</address>
            <a href="/contact/">Contact</a>
          </div>
        </div>

        <div className="footer-link-groups">
          {footerGroups.map((group) => (
            <nav key={group.title} aria-label={`Footer ${group.title}`} className="footer-link-group">
              <h2>{group.title}</h2>
              <div className="footer-links">
                {group.links.map((link) => (
                  <a key={link.href} href={link.href}>
                    {link.name}
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
