type SectionHeaderProps = {
  title: string;
  description?: string;
  href?: string;
  actionLabel?: string;
  level?: 1 | 2;
  id?: string;
};

export function SectionHeader({ title, description, href, actionLabel = "View all", level = 2, id }: SectionHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";

  return (
    <div className="section-heading">
      <div>
        <Heading id={id}>{title}</Heading>
        {description ? <p>{description}</p> : null}
      </div>
      {href ? (
        <a className="section-heading-link" href={href}>
          {actionLabel}
        </a>
      ) : null}
    </div>
  );
}
