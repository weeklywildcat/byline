import type { ArticleStoryCardView } from "@byline/ui";
import { articleStoryCard, getArticleReadingTime, getCoverageStories, isCoverageComplete } from "@/lib/article-presentation";
import { formatDisplayDate } from "@/lib/format";
import { getContributorName, getCoverageHref, getPostContributors, getPostHref, type WordPressCoverage, type WordPressPost } from "@/lib/wordpress";

export type CoverageStoryView = ArticleStoryCardView & {
  /** Reading order (Part 1, Part 2…) for a series. */
  number: number;
  byline: string;
  readingTime: string;
};

/** Everything the coverage page and its card render, with no renderer imports. */
export type CoveragePresentation = {
  id: number | string;
  format: WordPressCoverage["format"];
  title: string;
  href: string;
  description: string;
  overviewParagraphs: string[];
  /** "Oct. 2 – Oct. 30, 2026", or empty. */
  dateLabel: string;
  complete: boolean;
  /** "4 parts", "2 parts so far" or "7 stories". */
  countLabel: string;
  artwork: WordPressCoverage["artwork"];
  stories: CoverageStoryView[];
  /** The first part, for "Start reading". */
  startHref: string | null;
};

function bylineNames(post: WordPressPost) {
  const names = getPostContributors(post).map(getContributorName).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function getCoverageCountLabel(format: WordPressCoverage["format"], count: number, complete: boolean) {
  if (format === "series") {
    const parts = `${count} ${count === 1 ? "part" : "parts"}`;
    return complete || count === 0 ? parts : `${parts} so far`;
  }
  return `${count} ${count === 1 ? "story" : "stories"}`;
}

export function buildCoveragePresentation(coverage: WordPressCoverage, allPosts: readonly WordPressPost[]): CoveragePresentation {
  const memberIds = new Set(coverage.stories.map((story) => story.id));
  const posts = getCoverageStories(coverage, new Map(allPosts.filter((post) => memberIds.has(post.id)).map((post) => [post.id, post])));
  const complete = isCoverageComplete(coverage);
  const dateLabel = [coverage.startDate, coverage.endDate].filter((date): date is string => Boolean(date)).map(formatDisplayDate).join(" – ");
  const stories = posts.map((post, index) => ({
    // The lead of ongoing coverage is shown wide; everything else as a 4:3 thumbnail.
    ...articleStoryCard(post, coverage.format === "coverage" && index === 0
      ? { shape: "wide", sizes: "(max-width: 900px) 100vw, 760px" }
      : { shape: "standard", sizes: "(max-width: 700px) 34vw, 240px" }),
    number: index + 1,
    byline: bylineNames(post),
    readingTime: getArticleReadingTime(post)
  }));

  return {
    id: coverage.id,
    format: coverage.format,
    title: coverage.title,
    href: getCoverageHref(coverage),
    description: coverage.description,
    // Coverage recorded before overview paragraphs existed has none.
    overviewParagraphs: (coverage.overviewParagraphs ?? []).filter((paragraph) => paragraph !== coverage.description),
    dateLabel,
    complete,
    countLabel: getCoverageCountLabel(coverage.format, stories.length, complete),
    artwork: coverage.artwork,
    stories,
    startHref: posts[0] ? getPostHref(posts[0]) : null
  };
}
