import { Icon } from "@iconify/react/offline";
import { PHOSPHOR_ICONS, type PhosphorIconName } from "@/lib/phosphor-icons";

export type ExploreCard = {
  title: string;
  text: string;
  href: string;
  icon: PhosphorIconName;
};

type ExploreCardsProps = {
  cards: readonly ExploreCard[];
  // Four cards fit one row on wide screens; three or six use the default grid.
  columns?: 3 | 4;
};

// Whole-card links with an icon, used at the foot of the institutional pages.
// Icons are bundled and drawn with Iconify's offline renderer so they exist in
// the static HTML (see lib/phosphor-icons.ts).
export function ExploreCards({ cards, columns = 3 }: ExploreCardsProps) {
  return (
    <ul className={columns === 4 ? "about-explore-grid about-explore-grid-four" : "about-explore-grid"}>
      {cards.map((card) => (
        <li key={card.href}>
          <a href={card.href}>
            <Icon className="about-explore-icon" icon={PHOSPHOR_ICONS[card.icon]} width={28} height={28} aria-hidden="true" />
            <span className="about-explore-title">{card.title}</span>
            <span className="about-explore-text">{card.text}</span>
            <Icon className="about-explore-arrow" icon={PHOSPHOR_ICONS["arrow-right"]} width={20} height={20} aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
