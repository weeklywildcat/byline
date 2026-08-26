import type { Metadata } from "next";
import { AuthorDirectory } from "@/components/AuthorDirectory";
import { SectionHeader } from "@/components/SectionHeader";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { getPublicationConfig } from "@/lib/publication";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getAllPosts, getFeaturedMedia, getPostHref, type WordPressMedia, type WordPressPost } from "@/lib/wordpress";

type BrandAsset = {
  title: string;
  description: string;
  href: string;
  format: string;
  size: string;
  previewTone?: "light" | "dark";
};

const weeklyWildcatLogoAssets: BrandAsset[] = [
  {
    title: "Wide Logo Black",
    description: "Primary horizontal logo for light backgrounds, headers and print placements.",
    href: "/media-kit/logos/SVG/Weekly Wildcat Wide Logo - SVG Black.svg",
    format: "SVG",
    size: "Vector"
  },
  {
    title: "Wide Logo White",
    description: "Primary horizontal logo for dark backgrounds, video title cards and overlays.",
    href: "/media-kit/logos/SVG/Weekly Wildcat Wide Logo - SVG White.svg",
    format: "SVG",
    size: "Vector",
    previewTone: "dark"
  },
  {
    title: "Standard Logo Black",
    description: "Stacked logo lockup for light backgrounds and tighter placements.",
    href: "/media-kit/logos/SVG/Weekly Wildcat Standard Logo - SVG Black.svg",
    format: "SVG",
    size: "Vector"
  },
  {
    title: "Standard Logo White",
    description: "Stacked logo lockup for dark backgrounds and high-contrast layouts.",
    href: "/media-kit/logos/SVG/Weekly Wildcat Standard Logo - SVG White.svg",
    format: "SVG",
    size: "Vector",
    previewTone: "dark"
  },
  {
    title: "Wide Logo Black PNG",
    description: "Raster horizontal logo for platforms that do not accept SVG files.",
    href: "/media-kit/logos/PNG/Weekly Wildcat Wide Logo - SVG Black.png",
    format: "PNG",
    size: "1263 x 147"
  },
  {
    title: "Wide Logo White PNG",
    description: "Raster horizontal logo for dark graphics, video exports and presentations.",
    href: "/media-kit/logos/PNG/Weekly Wildcat Wide Logo - PNG White.png",
    format: "PNG",
    size: "1263 x 147",
    previewTone: "dark"
  },
  {
    title: "Standard Logo Black PNG",
    description: "Raster stacked logo for documents, slides and social graphics.",
    href: "/media-kit/logos/PNG/Weekly Wildcat Standard Logo - Black PNG.png",
    format: "PNG",
    size: "1843 x 588"
  },
  {
    title: "Standard Logo White PNG",
    description: "Raster stacked logo for dark graphics, overlays and presentation slides.",
    href: "/media-kit/logos/PNG/Weekly Wildcat Standard Logo - White PNG.png",
    format: "PNG",
    size: "1843 x 588",
    previewTone: "dark"
  },
  {
    title: "Open Graph Social Image",
    description: "Default social share image used when a page or story does not provide its own image.",
    href: "/media-kit/open-graph-social.png",
    format: "PNG",
    size: "1200 x 600"
  }
];

const weeklyWildcatFontAssets = [
  {
    name: "Babbell Bold",
    role: "Logo Lettering",
    sample: "logo"
  },
  {
    name: "Aktiv Grotesk",
    role: "Headlines, decks and body copy",
    sample: "Weekly Wildcat covers school stories with clarity and energy.",
    className: "media-kit-font-sample-body"
  },
  {
    name: "News Gothic Std",
    role: "Navigation, labels, metadata and buttons",
    sample: "NEWS  SPORTS  OPINION  FEATURES",
    className: "media-kit-font-sample-ui"
  },
  {
    name: "Alternate Gothic Condensed A",
    role: "Major package titles and section mastheads",
    sample: "Weekly Wildcat",
    className: "media-kit-font-sample-display"
  }
];

export const dynamic = "force-static";

const publication = getPublicationConfig();
const isWeeklyWildcatTheme = publication.appearance.theme === "weekly-wildcat";

function configuredBrandAssets(): BrandAsset[] {
  if (isWeeklyWildcatTheme) return weeklyWildcatLogoAssets;

  const candidates = [
    ["Masthead", publication.branding.masthead, "Primary publication masthead."],
    ["Publication Logo", publication.branding.logo, "Primary publication logo."],
    ["Organization Logo", publication.branding.organizationLogo, "Organization or school mark."],
    ["Default Social Image", publication.branding.defaultSocialImage, "Default social sharing image."]
  ] as const;
  const seen = new Set<string>();
  return candidates.flatMap(([title, asset, description]) => {
    if (!asset.url || seen.has(asset.url)) return [];
    seen.add(asset.url);
    const extension = /\.([a-z0-9]+)(?:\?|$)/i.exec(asset.url)?.[1]?.toUpperCase() || "IMAGE";
    const size = asset.width && asset.height ? `${asset.width} x ${asset.height}` : extension === "SVG" ? "Vector" : "Original";
    return [{ title, description, href: asset.url, format: extension, size }];
  });
}

const logoAssets = configuredBrandAssets();
const fontAssets = isWeeklyWildcatTheme ? weeklyWildcatFontAssets : [
  { name: "Theme display font", role: "Headlines and section titles", sample: publication.identity.shortName, className: "media-kit-font-sample-display" },
  { name: "Theme body font", role: "Stories and descriptive copy", sample: `${publication.identity.shortName} covers its community with clarity and care.`, className: "media-kit-font-sample-body" },
  { name: "Theme interface font", role: "Navigation, labels and metadata", sample: "NEWS  FEATURES  OPINION", className: "media-kit-font-sample-ui" }
];
const mediaKitDescription = `Download ${publication.identity.shortName} brand assets, publication images, and newsroom information for media use.`;

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Media Kit",
    description: mediaKitDescription,
    path: "/media-kit/"
  })
};

function getImageCredit(image: WordPressMedia) {
  return stripHtml(
    (image.bylineImage ?? image.weeklyWildcatImage)?.creditText ||
      image.media_details?.image_meta?.credit ||
      image.media_details?.image_meta?.copyright ||
      ""
  );
}

function getImageAlt(image: WordPressMedia) {
  return image.alt_text || stripHtml(image.title?.rendered ?? "") || `${publication.identity.shortName} editorial image`;
}

function getMediaKitImages(posts: WordPressPost[]) {
  const seenImages = new Set<number>();

  return posts
    .map((post) => ({
      post,
      image: getFeaturedMedia(post)
    }))
    .filter((item): item is { post: WordPressPost; image: WordPressMedia } => {
      if (!item.image?.source_url || seenImages.has(item.image.id)) {
        return false;
      }

      seenImages.add(item.image.id);
      return true;
    })
    .slice(0, 6);
}

export default async function MediaKitPage() {
  const posts = filterVisibleContentPosts(await getAllPosts());
  const mediaImages = getMediaKitImages(posts);
  const pageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Media Kit",
    description: mediaKitDescription,
    url: absoluteUrl("/media-kit/")
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Media Kit", path: "/media-kit/" }
  ]);

  return (
    <main className="section-page-shell media-kit-page">
      <script
        id="media-kit-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageSchema) }}
      />
      <script
        id="media-kit-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />

      <SectionHeader
        title="Media Kit"
        description={`Brand assets, publication images, b-roll notes, and newsroom information for ${publication.identity.shortName}.`}
        level={1}
      />

      <section className="media-kit-intro" aria-labelledby="media-kit-intro-heading">
        <div>
          <p className="profile-kicker">{publication.identity.shortName} Assets</p>
          <h2 id="media-kit-intro-heading">Use the official marks and credit student work clearly.</h2>
        </div>
        <p>
          These files are provided for coverage, school communications and community partners. Keep the logos unaltered,
          credit {publication.identity.shortName} when using publication images, and contact the newsroom for permissions, original files or
          b-roll requests.
        </p>
      </section>

      <section className="media-kit-section" aria-labelledby="media-kit-logos-heading">
        <div className="media-kit-section-heading">
          <h2 id="media-kit-logos-heading">Logos & Marks</h2>
          <p>Download the official logo files and default social share artwork for web, print, social and video placements.</p>
        </div>

        <div className="media-kit-logo-grid">
          {logoAssets.map((asset) => (
            <article className="media-kit-logo-card" key={asset.href}>
              <div
                className={
                  asset.previewTone === "dark"
                    ? "media-kit-logo-preview media-kit-logo-preview-dark"
                    : "media-kit-logo-preview"
                }
              >
                <img src={asset.href} alt="" loading="lazy" />
              </div>
              <div className="media-kit-card-body">
                <p className="media-kit-card-meta">
                  {asset.format} <span>{asset.size}</span>
                </p>
                <h3>{asset.title}</h3>
                <p>{asset.description}</p>
                <a href={asset.href} download>
                  Download
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="media-kit-section" aria-labelledby="media-kit-fonts-heading">
        <div className="media-kit-section-heading">
          <h2 id="media-kit-fonts-heading">Typography</h2>
          <p>{publication.identity.shortName} uses the typography defined by its active Byline theme and brand settings.</p>
        </div>

        <div className="media-kit-font-grid">
          {fontAssets.map((font) => (
            <article className="media-kit-font-card" key={font.name}>
              <p className="media-kit-card-meta">{font.role}</p>
              <h3>{font.name}</h3>
              {font.sample === "logo" && logoAssets[0] ? (
                <div className="media-kit-font-logo-sample">
                  <img src={logoAssets[0].href} alt={`${publication.identity.shortName} logo lettering`} />
                </div>
              ) : (
                <p className={font.className}>{font.sample}</p>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="media-kit-section" aria-labelledby="media-kit-images-heading">
        <div className="media-kit-section-heading">
          <h2 id="media-kit-images-heading">Images & B-Roll</h2>
          <p>Recent publication images are available below. For raw files, video clips or interview b-roll, contact the newsroom.</p>
        </div>

        {mediaImages.length ? (
          <div className="media-kit-image-grid">
            {mediaImages.map(({ post, image }) => {
              const credit = getImageCredit(image);
              const storyHref = getPostHref(post);

              return (
                <article className="media-kit-image-card" key={`${post.id}-${image.id}`}>
                  <a className="media-kit-image-frame" href={storyHref}>
                    <img
                      src={image.source_url}
                      alt={getImageAlt(image)}
                      width={image.media_details?.width}
                      height={image.media_details?.height}
                      loading="lazy"
                    />
                  </a>
                  <div className="media-kit-card-body">
                    <p className="media-kit-card-meta">{credit ? `Credit: ${credit}` : `${publication.identity.shortName} image`}</p>
                    <h3>{stripHtml(post.title.rendered)}</h3>
                    <div className="media-kit-card-actions">
                      <a href={image.source_url} download>
                        Download Image
                      </a>
                      <a href={storyHref}>View Story</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">Publication images will appear here as stories with featured media are published.</p>
        )}

        <div className="media-kit-broll-panel">
          <div>
            <h3>B-Roll Requests</h3>
            <p>
              Need clips from campus events, interviews or sports coverage? Send the newsroom the deadline, intended use
              and format you need so the staff can check what is available.
            </p>
          </div>
          <a href={publication.urls.contact}>Contact the Newsroom</a>
        </div>
      </section>

      <section className="media-kit-section media-kit-team-section" aria-labelledby="media-kit-team-heading">
        <div className="media-kit-section-heading">
          <h2 id="media-kit-team-heading">Our Team</h2>
          <p>Meet the students and contributors behind {publication.identity.shortName}.</p>
        </div>
        <AuthorDirectory />
      </section>
    </main>
  );
}
