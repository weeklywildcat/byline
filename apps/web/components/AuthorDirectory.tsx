import { AuthorBadge } from "@/components/AuthorBadge";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { getPublicationConfig } from "@/lib/publication";
import {
  getAllPosts,
  getAllPublicContributors,
  getContributorDescription,
  getContributorHref,
  getContributorPhoto,
  getContributorRole,
  getPostContributors,
  isGuestContributor,
  type WordPressContributor
} from "@/lib/wordpress";

async function getAuthorCards() {
  const [contributors, posts] = await Promise.all([getAllPublicContributors(), getAllPosts()]);
  const visiblePosts = filterVisibleContentPosts(posts);
  const authorPosts = contributors.map((contributor) => ({
    contributor,
    posts: visiblePosts.filter((post) => getPostContributors(post).some((candidate) => {
      if (isGuestContributor(candidate) !== isGuestContributor(contributor)) return false;

      return isGuestContributor(candidate)
        ? candidate.id === contributor.id || candidate.slug === contributor.slug
        : candidate.id === contributor.id;
    }))
  }));

  return authorPosts.sort((a, b) => b.posts.length - a.posts.length || a.contributor.name.localeCompare(b.contributor.name));
}

function AuthorCard({ contributor, storyCount }: { contributor: WordPressContributor; storyCount: number }) {
  const profile = !isGuestContributor(contributor) ? contributor.bylineProfile ?? contributor.weeklyWildcatProfile : null;
  const photo = getContributorPhoto(contributor);
  const description = stripHtml(getContributorDescription(contributor)) || `${getPublicationConfig().identity.shortName} contributor`;

  return (
    <article className="author-card">
      <a className="author-card-link" href={getContributorHref(contributor)}>
        {photo ? (
          <img className="author-avatar" src={photo.url} alt={photo.alt || ""} width={photo.width ?? 96} height={photo.height ?? 96} />
        ) : (
          <div className="author-avatar author-avatar-fallback" aria-hidden="true">
            {contributor.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="author-card-meta">
            <span>{getContributorRole(contributor)}</span>
            {profile?.founder ? <AuthorBadge label="Founder" /> : null}
          </div>
          <h2>{contributor.name}</h2>
          <p>{description}</p>
          <span className="author-card-stat">{storyCount === 1 ? "1 story" : `${storyCount} stories`}</span>
        </div>
      </a>
    </article>
  );
}

type AuthorDirectoryProps = {
  className?: string;
};

export async function AuthorDirectory({ className }: AuthorDirectoryProps) {
  const authorCards = await getAuthorCards();

  return (
    <div className={className ? `author-card-grid ${className}` : "author-card-grid"}>
      {authorCards.map(({ contributor, posts }) => (
        <AuthorCard key={`${isGuestContributor(contributor) ? "guest" : "user"}-${contributor.id}-${contributor.slug}`} contributor={contributor} storyCount={posts.length} />
      ))}
    </div>
  );
}
