import { decodeHtml, formatDisplayDate } from "@/lib/format";
import { isHiddenCategory } from "@/lib/content";
import {
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
};

export function ArticleByline({ author, contributors, category, date }: ArticleBylineProps) {
  const visibleCategory = category && !isHiddenCategory(category) ? category : null;
  const bylineContributors = contributors?.length ? contributors : author ? [author] : [];

  return (
    <div className="article-byline">
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
              <a href={getContributorHref(contributor)}>{getContributorName(contributor)}</a>
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
