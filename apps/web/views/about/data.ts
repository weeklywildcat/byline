import { optionalBuildData, requireBuildData } from "@/lib/build-data";
import { filterVisibleContentPosts } from "@/lib/content";
import { formatDisplayDate, stripHtml } from "@/lib/format";
import { getSportsArchiveHref } from "@/lib/sports-archive";
import { getPresentationMediaUrl, getResponsiveImageProps, type ResponsiveImageProps } from "@/lib/media";
import {
  getAllPages,
  getAllPosts,
  getAllPublicContributors,
  getContributorHref,
  getContributorPhoto,
  getContributorRole,
  getFeaturedMedia,
  getMediaCredit,
  getPostHref,
  type WordPressPage,
  type WordPressPost
} from "@/lib/wordpress";

export type AboutStory = { title: string; href: string; date: string };

export type AboutPhoto = {
  image: ResponsiveImageProps;
  credit: string;
  caption: string;
  story: AboutStory;
};

export type AboutEditor = {
  name: string;
  role: string;
  href: string;
  photo: { url: string; width: number | null; height: number | null } | null;
};

export type AboutStats = {
  storyCount: number;
  firstStoryDate: string | null;
  contributorCount: number;
  archive: { games: number; sports: number; earliestSeason: string | null; href: string } | null;
};

export type AboutData = {
  stats: AboutStats;
  editors: AboutEditor[];
  story: (slug: string) => AboutStory | undefined;
  photo: (slug: string, alt: string, sizes: string) => AboutPhoto | null;
};

function toStory(post: WordPressPost): AboutStory {
  return { title: stripHtml(post.title.rendered), href: getPostHref(post), date: post.date };
}

// The sports archive pages are fixed records, one heading per season and one
// anchor per game. Counting them here keeps the figures honest without a second
// copy of the numbers to maintain.
function getArchiveStats(pages: WordPressPage[]): AboutStats["archive"] {
  const sportPages = pages.filter((page) => {
    const key = page.bylinePage?.sportsArchive?.key;
    return key && key !== "index";
  });

  if (!sportPages.length) return null;

  let games = 0;
  let earliestStart = Number.POSITIVE_INFINITY;

  for (const page of sportPages) {
    games += page.content.rendered.match(/id="game-\d+"/g)?.length ?? 0;

    for (const match of page.content.rendered.matchAll(/id="season-(\d{4})-\d{2}"/g)) {
      earliestStart = Math.min(earliestStart, Number(match[1]));
    }
  }

  return {
    games,
    sports: sportPages.length,
    href: getSportsArchiveHref(pages),
    earliestSeason: Number.isFinite(earliestStart) ? `${earliestStart}–${String(earliestStart + 1).slice(2)}` : null
  };
}

export async function getAboutData(): Promise<AboutData> {
  const [allPosts, contributors, pages] = await Promise.all([
    requireBuildData("/wp-json/wp/v2/posts", getAllPosts),
    requireBuildData("/wp-json/byline/v1/contributors", getAllPublicContributors),
    optionalBuildData("/wp-json/wp/v2/pages", getAllPages, [] as WordPressPage[])
  ]);

  const posts = filterVisibleContentPosts(allPosts).sort((a, b) => b.date.localeCompare(a.date));
  const oldest = posts.at(-1);

  const editors = contributors
    .filter((contributor) => /editor/i.test(getContributorRole(contributor)))
    .map((contributor) => {
      const photo = getContributorPhoto(contributor);
      return {
        name: contributor.name,
        role: getContributorRole(contributor),
        href: getContributorHref(contributor),
        photo: photo?.url ? { url: getPresentationMediaUrl(photo.url), width: photo.width ?? null, height: photo.height ?? null } : null
      };
    });

  const bySlug = new Map(posts.map((post) => [post.slug, post]));

  return {
    stats: {
      storyCount: posts.length,
      firstStoryDate: oldest ? formatDisplayDate(oldest.date) : null,
      contributorCount: contributors.length,
      archive: getArchiveStats(pages)
    },
    editors,
    // Stories and photos are named by slug. If a story is ever unpublished the
    // page drops the link or the figure instead of breaking.
    story: (slug) => {
      const post = bySlug.get(slug);
      return post ? toStory(post) : undefined;
    },
    photo: (slug, alt, sizes) => {
      const post = bySlug.get(slug);
      const media = post ? getFeaturedMedia(post) : null;
      const image = media ? getResponsiveImageProps(media, { alt, sizes, loading: "lazy", imageSearchVisibility: "presentation" }) : null;

      if (!post || !media || !image) return null;

      return {
        image,
        credit: getMediaCredit(media),
        caption: stripHtml(media.caption?.rendered ?? ""),
        story: toStory(post)
      };
    }
  };
}
