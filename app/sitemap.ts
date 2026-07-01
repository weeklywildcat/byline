import type { MetadataRoute } from "next";
import { filterVisibleContentPosts } from "@/lib/content";
import { PUBLIC_SECTIONS } from "@/lib/sections";
import { absoluteUrl } from "@/lib/seo";
import { STATIC_PAGES } from "@/lib/static-pages";
import { getAllAuthors, getAllPosts, getAuthorHref, getPostHref, type WordPressPost } from "@/lib/wordpress";

export const dynamic = "force-static";

function parseSitemapDate(value: string | undefined) {
  if (!value || value.startsWith("0000-00-00")) {
    return undefined;
  }

  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const date = new Date(hasTimezone ? value : `${value}Z`);

  return Number.isFinite(date.getTime()) ? date : undefined;
}

function getPostSitemapDate(post: Pick<WordPressPost, "modified" | "modified_gmt">) {
  return parseSitemapDate(post.modified_gmt) ?? parseSitemapDate(post.modified);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [allPosts, authors] = await Promise.all([getAllPosts(), getAllAuthors()]);
  const posts = filterVisibleContentPosts(allPosts);
  const latestModifiedPost = posts.reduce<(typeof posts)[number] | undefined>((latestPost, post) => {
    if (!latestPost) {
      return post;
    }

    const postModified = getPostSitemapDate(post)?.getTime() ?? 0;
    const latestModified = getPostSitemapDate(latestPost)?.getTime() ?? 0;

    return postModified > latestModified ? post : latestPost;
  }, undefined);
  const latestModified = latestModifiedPost ? getPostSitemapDate(latestModifiedPost) : undefined;

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: latestModified,
      changeFrequency: "daily",
      priority: 1
    },
    ...PUBLIC_SECTIONS.map((section) => ({
      url: absoluteUrl(section.href),
      lastModified: latestModified,
      changeFrequency: "daily" as const,
      priority: 0.7
    })),
    {
      url: absoluteUrl("/authors/"),
      lastModified: latestModified,
      changeFrequency: "weekly",
      priority: 0.6
    },
    {
      url: absoluteUrl("/stories/"),
      lastModified: latestModified,
      changeFrequency: "daily",
      priority: 0.7
    },
    {
      url: absoluteUrl("/search/"),
      lastModified: latestModified,
      changeFrequency: "daily",
      priority: 0.5
    },
    {
      url: absoluteUrl("/sports/schedule/"),
      lastModified: latestModified,
      changeFrequency: "daily",
      priority: 0.7
    },
    ...STATIC_PAGES.map((page) => ({
      url: absoluteUrl(`/${page.slug}/`),
      lastModified: latestModified,
      changeFrequency: "monthly" as const,
      priority: 0.5
    }))
  ];

  const articlePages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(getPostHref(post)),
    lastModified: getPostSitemapDate(post),
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));

  const authorPages: MetadataRoute.Sitemap = authors.map((author) => ({
    url: absoluteUrl(getAuthorHref(author)),
    lastModified: latestModified,
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  return [...staticPages, ...articlePages, ...authorPages];
}
