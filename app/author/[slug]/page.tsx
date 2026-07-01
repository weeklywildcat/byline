import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthorBadge } from "@/components/AuthorBadge";
import { StoryTeaser } from "@/components/StoryTeaser";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { absoluteUrl, buildPageMetadata, getBreadcrumbSchema, serializeJsonLd } from "@/lib/seo";
import {
  getAllAuthors,
  getAuthorBySlug,
  getAuthorHref,
  getAuthorPhoto,
  getAuthorProfile,
  getAuthorSocialLinks,
  getPostsByAuthor
} from "@/lib/wordpress";

type AuthorPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const authors = await getAllAuthors();

  return authors.map((author) => ({
    slug: author.slug
  }));
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);

  if (!author) {
    return {};
  }

  const description = author.description
    ? stripHtml(author.description)
    : `Stories by ${author.name} for Weekly Wildcat.`;
  const photo = getAuthorPhoto(author);

  return buildPageMetadata({
    title: author.name,
    description,
    path: getAuthorHref(author),
    type: "profile",
    image: photo ? { url: photo.url, width: photo.width, height: photo.height, alt: author.name } : undefined
  });
}

function getWordCount(value: string) {
  return stripHtml(value).split(/\s+/).filter(Boolean).length;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function AuthorPage({ params }: AuthorPageProps) {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);

  if (!author) {
    notFound();
  }

  const posts = filterVisibleContentPosts(await getPostsByAuthor(author.id));
  const profile = getAuthorProfile(author);
  const photo = getAuthorPhoto(author);
  const socialLinks = getAuthorSocialLinks(author);
  const description = author.description ? stripHtml(author.description) : "Weekly Wildcat contributor";
  const wordCount = posts.reduce((total, post) => total + getWordCount(post.content.rendered), 0);
  const authorSchema = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: author.name,
      description,
      jobTitle: profile?.role || undefined,
      url: absoluteUrl(getAuthorHref(author)),
      image: photo?.url || undefined,
      sameAs: socialLinks.filter((link) => !link.href.startsWith("mailto:")).map((link) => link.href)
    }
  };
  const breadcrumbSchema = getBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Authors", path: "/authors/" },
    { name: author.name, path: getAuthorHref(author) }
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
            {author.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="author-profile-meta">
            <p className="profile-kicker">{profile?.role || "Author"}</p>
            {profile?.founder ? <AuthorBadge label="Founder" /> : null}
          </div>
          <h1>{author.name}</h1>
          {profile?.pronouns ? <p className="author-pronouns">{profile.pronouns}</p> : null}
          <p className="author-bio">{description}</p>
          <dl className="author-stats">
            <div>
              <dt>Stories</dt>
              <dd>{formatNumber(posts.length)}</dd>
            </div>
            <div>
              <dt>Words Written</dt>
              <dd>{formatNumber(wordCount)}</dd>
            </div>
          </dl>
          {socialLinks.length > 0 ? (
            <div className="author-social-links" aria-label={`${author.name} social links`}>
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
            <p>{posts.length === 1 ? "1 published story" : `${posts.length} published stories`}</p>
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
