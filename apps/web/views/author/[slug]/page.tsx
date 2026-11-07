import { ContributorBiography, ContributorProfileHeader } from "@byline/ui/contributor-profile";
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
  const posts = filterVisibleContentPosts(await getPostsByContributor(contributor));

  return buildPageMetadata({
    title: contributor.name,
    description,
    path: getContributorHref(contributor),
    type: "profile",
    image: photo ? { url: photo.url, width: photo.width, height: photo.height, alt: contributor.name } : undefined,
    // Keep staff profiles usable before a writer publishes, but do not create
    // thin search results. This also matches the sitemap's existing invariant.
    noIndex: posts.length === 0
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
  const shortBio = !isGuestContributor(contributor) ? stripHtml(profile?.shortBio ?? "") : "";
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
      <ContributorProfileHeader person={{ name: contributor.name, role: getContributorRole(contributor), photo, pronouns: profile?.pronouns, shortBio, socialLinks }} />
      <ContributorBiography bio={bio} />

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
