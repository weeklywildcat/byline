import { Icon } from "./Icon";
import { StoryCard } from "./StoryCard";
import { packageHeadingId } from "./package-dom";
import type { StoryView } from "./story-view";

export type MoreUtilityLinkView = {
  label: string;
  href: string;
  iconName: string;
  external?: boolean;
};

export type ResolvedMorePackage = {
  packageId: string;
  heading: string;
  archiveLink: { enabled: boolean; href: string; label: string };
  lead: StoryView | null;
  rail: StoryView[];
  presentation: {
    showDeck: boolean;
    cleanDeck: boolean;
  };
  utility: {
    enabled: boolean;
    publicationLabel: string;
    joinStaff: {
      enabled: boolean;
      heading: string;
      copy: string;
      links: MoreUtilityLinkView[];
    };
    stayConnected: {
      enabled: boolean;
      heading: string;
      copy: string;
      links: MoreUtilityLinkView[];
    };
  } | null;
  fallbackAuthorName: string;
};

export type MorePackageRendererProps = {
  package: ResolvedMorePackage;
};

function UtilityLink({ link }: { link: MoreUtilityLinkView }) {
  return (
    <a href={link.href} target={link.external ? "_blank" : undefined} rel={link.external ? "noreferrer" : undefined}>
      <Icon name={link.iconName} width={17} height={17} />
      {link.label}
    </a>
  );
}

export function MorePackage({ package: resolved }: MorePackageRendererProps) {
  if (!resolved.lead) return null;

  const headingId = packageHeadingId(resolved.packageId, "more-heading");
  const hasUtility = Boolean(
    resolved.utility &&
      (resolved.utility.joinStaff.enabled || resolved.utility.stayConnected.enabled)
  );

  return (
    <section className="more-weekly" aria-labelledby={headingId}>
      <div className="more-weekly-header">
        <h2 id={headingId}>{resolved.heading}</h2>
        <span aria-hidden="true" />
        {resolved.archiveLink.enabled ? <a href={resolved.archiveLink.href}>{resolved.archiveLink.label}</a> : null}
      </div>

      <div className={hasUtility ? "more-weekly-layout" : "more-weekly-layout more-weekly-layout-single"}>
        <div className="more-story-grid">
          <StoryCard
            story={resolved.lead}
            variant="more-lead"
            showDeck={resolved.presentation.showDeck}
            fallbackAuthorName={resolved.fallbackAuthorName}
          />
          {resolved.rail.length ? (
            <div className="more-compact-list">
              {resolved.rail.map((story) => (
                <StoryCard
                  key={story.id}
                  story={story}
                  variant="more-compact"
                  showDeck={resolved.presentation.showDeck}
                  fallbackAuthorName={resolved.fallbackAuthorName}
                />
              ))}
            </div>
          ) : null}
        </div>

        {hasUtility && resolved.utility ? (
          <aside className="more-utility-rail" aria-label={`${resolved.utility.publicationLabel} links`}>
            <p className="more-rail-label">{resolved.utility.publicationLabel}</p>
            {resolved.utility.joinStaff.enabled ? (
              <div className="more-utility-block">
                <div className="more-utility-block-heading">
                  <Icon name="ph:newspaper-clipping" width={18} height={18} />
                  <h3>{resolved.utility.joinStaff.heading}</h3>
                </div>
                <p>{resolved.utility.joinStaff.copy}</p>
                {resolved.utility.joinStaff.links.length ? (
                  <div className="more-action-links">
                    {resolved.utility.joinStaff.links.map((link) => <UtilityLink key={`${link.href}-${link.label}`} link={link} />)}
                  </div>
                ) : null}
              </div>
            ) : null}
            {resolved.utility.stayConnected.enabled ? (
              <div className="more-utility-block">
                <div className="more-utility-block-heading">
                  <Icon name="ph:chat-circle-dots" width={18} height={18} />
                  <h3>{resolved.utility.stayConnected.heading}</h3>
                </div>
                <p>{resolved.utility.stayConnected.copy}</p>
                {resolved.utility.stayConnected.links.length ? (
                  <nav className="more-connect-links" aria-label="Stay connected">
                    {resolved.utility.stayConnected.links.map((link) => <UtilityLink key={`${link.href}-${link.label}`} link={link} />)}
                  </nav>
                ) : null}
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
