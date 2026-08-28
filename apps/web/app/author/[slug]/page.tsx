import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthorBadge } from "@/components/AuthorBadge";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts, getPrimaryPublicCategory, getPrimaryVisibleCategory } from "@/lib/content";
import { decodeHtml, stripHtml } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { requireBuildData } from "@/lib/build-data";
import { getPublicationConfig } from "@/lib/publication";
import { BYLINE_EMPTY_ROUTE_SLUG, isBylineEmptyRouteSlug, withEmptyRouteFallback } from "@/lib/static-params";
import {
  getAllPublicContributors,
  getContributorBySlug,
  getContributorDescription,
  getContributorHref,
  getContributorPhoto,
  getContributorRole,
  getContributorSocialLinks,
  getPostsByContributor,
  isGuestContributor,
  type WordPressPost
} from "@/lib/wordpress";

type AuthorPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = false;
const publication = getPublicationConfig();

// A brand-new publication can have zero published authors; that must still build.
export async function generateStaticParams() {
  const contributors = await requireBuildData("/wp-json/byline/v1/contributors", getAllPublicContributors);

  return withEmptyRouteFallback(
    contributors.map((contributor) => ({
      slug: contributor.slug
    })),
    { slug: BYLINE_EMPTY_ROUTE_SLUG }
  );
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const contributor = await getContributorBySlug(slug);

  if (!contributor) {
    return {};
  }

  const description = stripHtml(getContributorDescription(contributor))
    || `Stories by ${contributor.name} for ${publication.identity.shortName}.`;
  const photo = getContributorPhoto(contributor);

  return buildPageMetadata({
    title: contributor.name,
    description,
    path: getContributorHref(contributor),
    type: "profile",
    image: photo ? { url: photo.url, width: photo.width, height: photo.height, alt: contributor.name } : undefined
  });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(publication.locale).format(value);
}

function getAuthorBeats(posts: WordPressPost[], limit = 2) {
  const counts = new Map<string, number>();

  for (const post of posts) {
    const category = getPrimaryPublicCategory(post) ?? getPrimaryVisibleCategory(post);

    if (!category) {
      continue;
    }

    const name = decodeHtml(category.name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

function getFirstBylineLabel(posts: WordPressPost[]) {
  const [earliest] = posts
    .map((post) => post.date)
    .filter(Boolean)
    .sort();

  if (!earliest) {
    return null;
  }

  const [year, month] = earliest.split("T")[0].split("-").map(Number);

  if (!year || !month) {
    return null;
  }

  return new Intl.DateTimeFormat(publication.locale, { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params;

  if (isBylineEmptyRouteSlug(slug)) notFound();

  const contributor = await getContributorBySlug(slug);

  if (!contributor) {
    notFound();
  }

  const posts = filterVisibleContentPosts(await getPostsByContributor(contributor));
  const profile = !isGuestContributor(contributor) ? contributor.bylineProfile ?? contributor.weeklyWildcatProfile : null;
  const photo = getContributorPhoto(contributor);
  const socialLinks = getContributorSocialLinks(contributor);
  const description = stripHtml(getContributorDescription(contributor)) || `${publication.identity.shortName} contributor`;
  const beats = getAuthorBeats(posts);
  const firstByline = getFirstBylineLabel(posts);
  const authorSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: contributor.name,
      description,
      jobTitle: getContributorRole(contributor) || undefined,
      url: absoluteUrl(getContributorHref(contributor)),
      image: photo?.url ? absoluteUrl(photo.url) : undefined,
      sameAs: socialLinks.filter((link) => !link.href.startsWith("mailto:")).map((link) => link.href)
    }
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Authors", path: "/authors/" },
    { name: contributor.name, path: getContributorHref(contributor) }
  ]);

  return (
    <main className="section-page-shell author-page-shell">
      <script
        id="author-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(authorSchema) }}
      />
      <script
        id="author-breadcrumb-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbSchema) }}
      />
      <header className="author-profile">
        {photo ? (
          <img
            className="author-avatar"
            src={photo.url}
            alt={photo.alt || ""}
            width={photo.width ?? 160}
            height={photo.height ?? 160}
          />
        ) : (
          <div className="author-avatar author-avatar-fallback" aria-hidden="true">
            {contributor.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="author-profile-meta">
            <p className="profile-kicker">{getContributorRole(contributor)}</p>
            {profile?.founder ? <AuthorBadge label="Founder" /> : null}
          </div>
          <h1>{contributor.name}</h1>
          {profile?.pronouns ? <p className="author-pronouns">{profile.pronouns}</p> : null}
          <p className="author-bio">{description}</p>
          <dl className="author-stats">
            <div>
              <dt>Stories</dt>
              <dd>{formatNumber(posts.length)}</dd>
            </div>
            {beats.length > 0 ? (
              <div>
                <dt>{beats.length === 1 ? "Beat" : "Beats"}</dt>
                <dd>{beats.join(", ")}</dd>
              </div>
            ) : null}
            {firstByline ? (
              <div>
                <dt>First Byline</dt>
                <dd>{firstByline}</dd>
              </div>
            ) : null}
          </dl>
          {socialLinks.length > 0 ? (
              <div className="author-social-links" aria-label={`${contributor.name} social links`}>
              {socialLinks.map((link) => (
                <a key={link.label} href={link.href}>
                  {link.label}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </header>

      <section className="author-story-section" aria-labelledby="author-stories-heading">
        <div className="section-heading">
          <div>
            <h2 id="author-stories-heading">Latest Stories</h2>
          </div>
        </div>

        {posts.length > 0 ? (
          <div className="author-story-list">
            {posts.map((post) => (
              <StoryTeaser key={post.id} post={post} variant="standard" />
            ))}
          </div>
        ) : (
          <p className="empty-state">No published stories are available for this author yet.</p>
        )}
      </section>
    </main>
  );
}
