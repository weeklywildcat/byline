import { largestNaturalImage, type PublicStorySnapshot } from "@byline/content";
import { articleBodyPlainText, plainTextFromHtml } from "@byline/content/story";
import { youTubeDefaultThumbnailUrl } from "@byline/core";
import { absoluteUrl, buildPageMetadata, getPublisherSchema, getSeoDescription } from "./seo";
import { decodeHtml } from "./format";
import { nativeMedia } from "./native-snapshot";

function description(story: PublicStorySnapshot) {
  return getSeoDescription(story.excerptHtml || articleBodyPlainText(story.body));
}

export function nativeArticleMetadata(story: PublicStorySnapshot) {
  const asset = story.image ? nativeMedia(story.image) : undefined;
  const social = asset?.manifest.kind === "image" ? asset.manifest.social : null;
  const metadata = buildPageMetadata({
    title: decodeHtml(story.title), description: description(story), path: story.href, type: "article",
    image: social ? { url: social.publicPath, width: social.width, height: social.height, alt: asset?.alt } : null
  });
  return {
    ...metadata,
    openGraph: {
      ...metadata.openGraph, type: "article" as const, publishedTime: story.publishedAt, modifiedTime: latestModification(story),
      authors: story.contributors.flatMap((person) => person.href ? [absoluteUrl(person.href)] : []),
      section: decodeHtml(story.section.name), tags: story.topics.map((topic) => decodeHtml(topic.name))
    }
  };
}

export function nativeArticleJsonLd(story: PublicStorySnapshot, includeBody: boolean) {
  const { url, title, publishedAt } = story;
  const modifiedAt = latestModification(story);
  const authors = story.contributors.map((person) => ({
    "@type": "Person", name: person.name, ...(person.href ? { "@id": `${absoluteUrl(person.href)}#person`, url: absoluteUrl(person.href) } : {}),
    ...(person.role ? { jobTitle: person.role } : {}), ...(person.bio ? { description: person.bio } : {})
  }));
  const asset = story.image ? nativeMedia(story.image) : undefined;
  const manifest = asset?.manifest.kind === "image" ? asset.manifest : null;
  const files = manifest ? [...new Map([largestNaturalImage(manifest), ...Object.values(manifest.seo)].map((file) => [file.publicPath, file])).values()] : [];
  const image = files.map((file, index) => ({
    "@type": "ImageObject", ...(index === 0 ? { "@id": `${url}#primaryimage` } : {}),
    contentUrl: absoluteUrl(file.publicPath), url: absoluteUrl(file.publicPath), width: file.width, height: file.height,
    caption: story.leadCaption || undefined, creator: asset?.creator ? { "@type": "Person", name: asset.creator } : undefined,
    creditText: asset?.credit || asset?.creator || undefined, copyrightNotice: asset?.copyright || undefined, license: asset?.license ? absoluteUrl(asset.license) : undefined
  }));
  const publisher = getPublisherSchema();
  const article = {
    "@type": story.live ? ["NewsArticle", "LiveBlogPosting"] : "NewsArticle", "@id": `${url}#article`, mainEntityOfPage: { "@type": "WebPage", "@id": url },
    headline: decodeHtml(title), description: description(story), url, datePublished: publishedAt, dateModified: modifiedAt, publisher,
    author: authors.length === 1 ? authors[0] : authors.length ? authors : { "@type": "Organization", name: publisher.name },
    articleSection: decodeHtml(story.section.name), keywords: story.topics.length ? story.topics.map((topic) => decodeHtml(topic.name)).join(", ") : undefined,
    image: image.length ? image : undefined, primaryImageOfPage: image.length ? { "@id": image[0]["@id"] } : undefined,
    ...(story.live ? { coverageStartTime: story.live.startedAt, coverageEndTime: story.live.endedAt ?? undefined,
      liveBlogUpdate: story.live.updates.map((update) => ({ "@type": "BlogPosting", headline: update.title, articleBody: plainTextFromHtml(update.html),
        datePublished: update.date, url: `${story.url}#update-${update.id}` })) } : {}),
    articleBody: includeBody ? articleBodyPlainText(story.body) || undefined : undefined, isAccessibleForFree: true
  };
  const video = nativeVideoMetadata(story);
  if (!video) return { "@context": "https://schema.org", ...article };
  return {
    "@context": "https://schema.org",
    "@graph": [{ ...article, video: { "@id": `${url}#video` } }, {
      "@type": "VideoObject", "@id": `${url}#video`, name: video.name, description: video.description,
      thumbnailUrl: [video.thumbnailUrl], uploadDate: video.uploadDate, embedUrl: video.embedUrl, duration: video.duration,
      isPartOf: { "@id": article["@id"] }, publisher: { "@id": publisher["@id"] }
    }]
  };
}

export function nativeVideoMetadata(story: PublicStorySnapshot) {
  const video = story.videoMetadata;
  if (!video || !story.primaryVideo) return null;
  return {
    videoId: video.videoId, embedUrl: story.primaryVideo.embedUrl, name: story.primaryVideo.title,
    description: getSeoDescription(plainTextFromHtml(story.excerptHtml) || video.description || articleBodyPlainText(story.body) || story.title),
    thumbnailUrl: video.thumbnailUrl ?? youTubeDefaultThumbnailUrl(video.videoId), uploadDate: video.uploadDate ?? story.publishedAt,
    duration: video.duration, durationLabel: story.primaryVideo.duration ?? null
  };
}

function latestModification(story: PublicStorySnapshot) {
  return story.live && Date.parse(story.live.updatedAt) > Date.parse(story.modifiedAt) ? story.live.updatedAt : story.modifiedAt;
}
