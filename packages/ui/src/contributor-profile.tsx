/** Reader-facing presentation only: no CMS types, fetching, routing or SEO. */
export type ContributorPresentation = {
  name: string;
  role: string;
  pronouns?: string;
  shortBio?: string;
  photo?: {
    url: string;
    alt?: string;
    width?: number | null;
    height?: number | null;
  } | null;
  socialLinks?: { label: string; href: string }[];
};

export function ContributorAvatar({
  person,
  size = 160,
}: {
  person: ContributorPresentation;
  size?: number;
}) {
  return person.photo ? (
    <img
      className="author-avatar"
      src={person.photo.url}
      alt={person.photo.alt?.trim() || person.name}
      width={person.photo.width ?? size}
      height={person.photo.height ?? size}
    />
  ) : (
    <div className="author-avatar author-avatar-fallback" aria-hidden="true">
      {person.name.slice(0, 1)}
    </div>
  );
}

export function ContributorSocialLinks({
  person,
}: {
  person: ContributorPresentation;
}) {
  const links = (person.socialLinks ?? []).filter(
    (link) =>
      link.label.trim() &&
      (/^(https?:\/\/|mailto:)/i.test(link.href) ||
        (link.href.startsWith("/") && !link.href.startsWith("//"))),
  );
  if (!links.length) return null;
  return (
    <div
      className="author-social-links"
      aria-label={`${person.name} social links`}
    >
      {links.map((link, index) => (
        <a key={`${index}:${link.label}`} href={link.href}>
          {link.label}
        </a>
      ))}
    </div>
  );
}

export function ContributorDirectoryCard({
  person,
  href,
  description,
  storyCount = 0,
}: {
  person: ContributorPresentation;
  href?: string | null;
  description?: string;
  storyCount?: number;
}) {
  const body = (
    <>
      <ContributorAvatar person={person} size={96} />
      <div className="author-card-body">
        <span className="author-card-role">{person.role}</span>
        <h2>{person.name}</h2>
        {description ? <p>{description}</p> : null}
        {storyCount > 0 ? (
          <div className="author-card-meta">
            <span className="author-card-stat">
              {storyCount === 1 ? "1 story" : `${storyCount} stories`}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
  return (
    <article className="author-card">
      {href ? (
        <a className="author-card-link" href={href}>
          {body}
        </a>
      ) : (
        <div className="author-card-link">{body}</div>
      )}
    </article>
  );
}

export function ContributorProfileHeader({
  person,
}: {
  person: ContributorPresentation;
}) {
  return (
    <header className="author-profile">
      <ContributorAvatar person={person} />
      <div>
        <div className="author-profile-meta">
          <p className="profile-kicker">{person.role}</p>
        </div>
        <h1>{person.name}</h1>
        {person.pronouns ? (
          <p className="author-pronouns">{person.pronouns}</p>
        ) : null}
        {person.shortBio ? (
          <p className="author-short-bio">{person.shortBio}</p>
        ) : null}
        <ContributorSocialLinks person={person} />
      </div>
    </header>
  );
}

export function ContributorBiography({
  bio,
  headingId = "author-about-heading",
}: {
  bio: string;
  headingId?: string;
}) {
  return bio ? (
    <section className="author-about" aria-labelledby={headingId}>
      <h2 id={headingId}>About</h2>
      <p className="author-bio">{bio}</p>
    </section>
  ) : null;
}
