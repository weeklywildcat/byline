import { SiteIcon } from "./SiteIcon";

type AuthorBadgeProps = {
  label: "Founder";
};

const badgeDescriptions: Record<AuthorBadgeProps["label"], string> = {
  Founder: "Founding staff member who helped launch the Weekly Wildcat student newspaper."
};

export function AuthorBadge({ label }: AuthorBadgeProps) {
  const tooltipId = `author-badge-${label.toLowerCase()}-tooltip`;

  return (
    <span className="author-badge-wrap" tabIndex={0} aria-describedby={tooltipId}>
      <span className="author-badge">
        <SiteIcon className="author-badge-star" name="ph:star-fill" width={11} height={11} />
        {label}
      </span>
      <span className="author-badge-tooltip" id={tooltipId} role="tooltip">
        {badgeDescriptions[label]}
      </span>
    </span>
  );
}
