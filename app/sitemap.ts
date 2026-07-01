import type { MetadataRoute } from "next";
import { filterVisibleContentPosts } from "@/lib/content";
import { PUBLIC_SECTIONS } from "@/lib/sections";
import { absoluteUrl } from "@/lib/seo";
import { STATIC_PAGES } from "@/lib/static-pages";
import { getAllAuthors, getAllPosts, getAuthorHref, getPostHref } from "@/lib/wordpress";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [allPosts, authors] = await Promise.all([getAllPosts(), getAllAuthors()]);
  const posts = filterVisibleContentPosts(allPosts);
  const latestModifiedPost = posts.reduce<(typeof posts)[number] | undefined>((latestPost, post) => {
    if (!latestPost) {
      return post;
    }

    return new Date(post.modified).getTime() > new Date(latestPost.modified).getTime() ? post : latestPost;
  }, undefined);

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: latestModifiedPost?.modified,
      changeFrequency: "daily",
      priority: 1
    },
    ...PUBLIC_SECTIONS.map((section) => ({
      url: absoluteUrl(section.href),
      lastModified: latestModifiedPost?.modified,
      changeFrequency: "daily" as const,
      priority: 0.7
    })),
    {
      url: absoluteUrl("/authors/"),
      lastModified: latestModifiedPost?.modified,
      changeFrequency: "weekly",
      priority: 0.6
    },
    {
      url: absoluteUrl("/stories/"),
      lastModified: latestModifiedPost?.modified,
      changeFrequency: "daily",
      priority: 0.7
    },
    ...STATIC_PAGES.map((page) => ({
      url: absoluteUrl(`/${page.slug}/`),
      lastModified: latestModifiedPost?.modified,
      changeFrequency: "monthly" as const,
      priority: 0.5
    }))
  ];

  const articlePages: MetadataRoute.Sitemap = posts.map((post) => ({
    url: absoluteUrl(getPostHref(post)),
    lastModified: post.modified,
    changeFrequency: "weekly" as const,
    priority: 0.8
  }));

  const authorPages: MetadataRoute.Sitemap = authors.map((author) => ({
    url: absoluteUrl(getAuthorHref(author)),
    lastModified: latestModifiedPost?.modified,
    changeFrequency: "weekly" as const,
    priority: 0.6
  }));

  return [...staticPages, ...articlePages, ...authorPages];
}
