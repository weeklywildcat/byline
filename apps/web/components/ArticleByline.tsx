import { StoryVideoBadge } from "@byline/ui";
import { decodeHtml, formatDisplayDate } from "@/lib/format";
import { isHiddenCategory } from "@/lib/content";
import {
  contributorHasProfilePage,
  getContributorHref,
  getContributorName,
  getCategoryHref,
  isGuestContributor,
  type WordPressAuthor,
  type WordPressCategory,
  type WordPressContributor
} from "@/lib/wordpress";
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();

type ArticleBylineProps = {
  author?: WordPressAuthor | null;
  contributors?: WordPressContributor[];
  category: WordPressCategory | null;
  date: string;
  /** A video story leads the line with a small "Video" label. */
  video?: boolean;
};

export function ArticleByline({ author, contributors, category, date, video = false }: ArticleBylineProps) {
  const visibleCategory = category && !isHiddenCategory(category) ? category : null;
  const bylineContributors = contributors?.length ? contributors : author ? [author] : [];

  return (
    <div className="article-byline">
      {video ? <StoryVideoBadge /> : null}
      {visibleCategory ? (
        <a className="eyebrow-link" href={getCategoryHref(visibleCategory)}>
          {decodeHtml(visibleCategory.name)}
        </a>
      ) : null}
      {bylineContributors.length > 0 ? (
        <span className="article-byline-contributors">
          {bylineContributors.map((contributor, index) => (
            <span key={`${isGuestContributor(contributor) ? "guest" : "user"}-${contributor.id}-${contributor.slug}`}>
              {index > 0 ? ", " : null}
              {contributorHasProfilePage(contributor)
                ? <a href={getContributorHref(contributor)}>{getContributorName(contributor)}</a>
                : getContributorName(contributor)}
            </span>
          ))}
        </span>
      ) : (
        <span>{publication.identity.shortName} Staff</span>
      )}
      <time dateTime={date}>{formatDisplayDate(date)}</time>
    </div>
  );
}
