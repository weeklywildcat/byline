import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { AuthorBadge } from "@/components/AuthorBadge";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import { getPublicationConfig } from "@/lib/publication";
import {
  getContributorBySlug,
  getContributorDescription,
  getContributorHref,
  getContributorPhoto,
  getContributorRole,
  getContributorSocialLinks,
  getPostsByContributor,
  isGuestContributor
} from "@/lib/wordpress";

type AuthorPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

const publication = getPublicationConfig();

export async function getMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;

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

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params;

  const contributor = await getContributorBySlug(slug);

  if (!contributor) {
    notFound();
  }

  const posts = filterVisibleContentPosts(await getPostsByContributor(contributor));
  const profile = !isGuestContributor(contributor) ? contributor.bylineProfile ?? contributor.weeklyWildcatProfile : null;
  const photo = getContributorPhoto(contributor);
  const socialLinks = getContributorSocialLinks(contributor);
  const description = stripHtml(getContributorDescription(contributor)) || `${publication.identity.shortName} contributor`;
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
        <p className="author-bio">{description}</p>
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
