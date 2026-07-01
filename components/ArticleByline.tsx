import { decodeHtml, formatDisplayDate } from "@/lib/format";
import { isHiddenCategory } from "@/lib/content";
import { getAuthorHref, getCategoryHref, type WordPressAuthor, type WordPressCategory } from "@/lib/wordpress";

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
      {author ? <a href={getAuthorHref(author)}>{author.name}</a> : <span>Weekly Wildcat Staff</span>}
      <time dateTime={date}>{formatDisplayDate(date)}</time>
    </div>
  );
}
