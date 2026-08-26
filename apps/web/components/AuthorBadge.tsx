import { SiteIcon } from "./SiteIcon";
import { getPublicationConfig } from "@/lib/publication";

type AuthorBadgeProps = {
  label: "Founder";
};

export function AuthorBadge({ label }: AuthorBadgeProps) {
  const publication = getPublicationConfig();
  const tooltipId = `author-badge-${label.toLowerCase()}-tooltip`;

  return (
    <span className="author-badge-wrap" tabIndex={0} aria-describedby={tooltipId}>
      <span className="author-badge">
        <SiteIcon className="author-badge-star" name="ph:star-fill" width={11} height={11} />
        {label}
      </span>
      <span className="author-badge-tooltip" id={tooltipId} role="tooltip">
        Founding staff member who helped launch {publication.identity.shortName}.
      </span>
    </span>
  );
}
