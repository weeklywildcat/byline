import { decodeHtml, formatDisplayDate } from "@/lib/format";
import { isHiddenCategory } from "@/lib/content";
import { getAuthorHref, getCategoryHref, type WordPressAuthor, type WordPressCategory } from "@/lib/wordpress";
import { getPublicationConfig } from "@/lib/publication";

const publication = getPublicationConfig();

type ArticleBylineProps = {
  author: WordPressAuthor | null;
  category: WordPressCategory | null;
  date: string;
};

export function ArticleByline({ author, category, date }: ArticleBylineProps) {
  const visibleCategory = category && !isHiddenCategory(category) ? category : null;

  return (
    <div className="article-byline">
      {visibleCategory ? (
        <a className="eyebrow-link" href={getCategoryHref(visibleCategory)}>
          {decodeHtml(visibleCategory.name)}
        </a>
      ) : null}
      {author ? <a href={getAuthorHref(author)}>{author.name}</a> : <span>{publication.identity.shortName} Staff</span>}
      <time dateTime={date}>{formatDisplayDate(date)}</time>
    </div>
  );
}
