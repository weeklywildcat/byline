import { mediaCredit } from "@byline/article-body";
import { buildArticlePresentation, storyCardView, type StoryImageUsage } from "@byline/content/story";
import type { PublicStorySnapshot } from "@byline/content";
import { largestNaturalImage } from "@byline/content";
import type { ArticleRenderHost } from "@byline/ui/article-body";
import { getNativeSnapshot, nativeMedia, nativeStory, nativeStoryIndex } from "./native-snapshot";

export function nativeImage(id: number, usage: StoryImageUsage) {
  const asset = nativeMedia(id);
  if (asset?.manifest.kind !== "image") return null;
  const { manifest } = asset;
  const crop = usage.shape && usage.shape !== "social" ? manifest.crops[usage.shape] : undefined;
  const ladder = usage.shape === "social" ? [manifest.social] : crop?.renditions ?? manifest.natural;
  const fallback = ladder[ladder.length - 1];
  const { x, y } = manifest.focalPoint;
  return {
    src: fallback.publicPath, alt: asset.alt, width: fallback.width, height: fallback.height, sizes: usage.sizes,
    srcSet: ladder.map((file) => `${file.publicPath} ${file.width}w`).join(", "),
    credit: mediaCredit(asset),
    ...(!crop && (x !== 50 || y !== 50) ? { objectPosition: `${x}% ${y}%` } : {})
  };
}

export function nativeArticleDate(iso: string) {
  const { locale, timezone } = getNativeSnapshot()!.publication;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: timezone }).format(new Date(iso));
}

export const nativeBodyImage: ArticleRenderHost["imageSources"] = (asset) => {
  const item = nativeMedia(Number(asset.id));
  if (item?.manifest.kind !== "image") return undefined;
  const manifest = item.manifest;
  return { src: largestNaturalImage(manifest).publicPath, srcSet: manifest.natural.map((file) => `${file.publicPath} ${file.width}w`).join(", ") };
};

export function nativeArticlePresentation(story: PublicStorySnapshot) {
  const { publication } = getNativeSnapshot()!;
  const { byTerm, byContributor, collections } = nativeStoryIndex()!;
  const presentation = buildArticlePresentation(story, {
    image: (id, usage) => {
      const image = nativeImage(id, usage);
      return image && usage.role === "lead" ? { ...image, fallbackCaption: story.leadCaption } : image;
    },
    formatDate: nativeArticleDate,
    publication: { shortName: publication.identity.shortName, contactHref: publication.urls.contact },
    relatedCandidates: [...new Set([...story.sectionKeys, ...story.topicKeys].flatMap((key) => byTerm.get(key) ?? []))],
    contributorStories: [...new Set(story.contributorKeys.flatMap((key) => byContributor.get(key) ?? []))],
    series: (collections.get(story.id) ?? []).map((entry) => ({
      id: entry.id, title: entry.title, href: `/coverage/${entry.slug}/`, description: entry.description, format: entry.format,
      complete: entry.status === "past" || entry.status === "archived", stories: entry.stories.map((id) => nativeStory(id)!)
    }))
  });
  return presentation;
}

export function nativeArticleCard(story: PublicStorySnapshot, usage: Pick<StoryImageUsage, "shape" | "sizes">) {
  return storyCardView(story, { image: (id) => nativeImage(id, { ...usage, role: "card", priority: false, searchVisibility: "presentation" }), formatDate: nativeArticleDate });
}
