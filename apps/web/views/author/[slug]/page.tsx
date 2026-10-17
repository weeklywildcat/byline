import type { Metadata } from "@/lib/metadata";
import { notFound } from "@/lib/static-not-found";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { buildPageMetadata, getBreadcrumbSchema, getProfilePageSchema, serializeJsonLd } from "@/lib/seo";
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

  const bio = stripHtml(getContributorDescription(contributor));
  // A bio of a couple of emoji says nothing in a search result.
  const description = bio.length >= 20 && /\p{L}{3}/u.test(bio)
    ? bio
    : `Stories by ${contributor.name} for ${publication.identity.shortName}.`;
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
  const bio = stripHtml(getContributorDescription(contributor));
  const authorSchema = getProfilePageSchema(contributor, posts);
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Staff", path: "/staff/" },
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
            alt={photo.alt?.trim() || contributor.name}
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
      </header>

      {bio ? (
        <section className="author-about" aria-labelledby="author-about-heading">
          <h2 id="author-about-heading">About</h2>
          <p className="author-bio">{bio}</p>
        </section>
      ) : null}

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
