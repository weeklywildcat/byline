import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import { getPresentationMediaUrl } from "@/lib/media";
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

function AuthorCard({ contributor, storyCount, showDescription }: { contributor: WordPressContributor; storyCount: number; showDescription: boolean }) {
  const profile = !isGuestContributor(contributor) ? contributor.bylineProfile ?? contributor.weeklyWildcatProfile : null;
  const photo = getContributorPhoto(contributor);
  const description = stripHtml(getContributorDescription(contributor)) || `${getPublicationConfig().identity.shortName} contributor`;

  return (
    <article className="author-card">
      <a className="author-card-link" href={getContributorHref(contributor)}>
        {photo ? (
          <img className="author-avatar" src={getPresentationMediaUrl(photo.url)} alt={photo.alt || contributor.name} width={photo.width ?? 96} height={photo.height ?? 96} />
        ) : (
          <div className="author-avatar author-avatar-fallback" aria-hidden="true">
            {contributor.name.slice(0, 1)}
          </div>
        )}
        <div className="author-card-body">
          <span className="author-card-role">{getContributorRole(contributor)}</span>
          <h2>{contributor.name}</h2>
          {showDescription ? <p>{description}</p> : null}
          {storyCount > 0 ? (
            <div className="author-card-meta">
              <span className="author-card-stat">{storyCount === 1 ? "1 story" : `${storyCount} stories`}</span>
            </div>
          ) : null}
        </div>
      </a>
    </article>
  );
}

type AuthorDirectoryProps = {
  className?: string;
  // The bio, or a generic fallback when there is none. The author's own page
  // carries the full bio, so the directory can leave it out.
  showDescriptions?: boolean;
};

export async function AuthorDirectory({ className, showDescriptions = true }: AuthorDirectoryProps) {
  const authorCards = await getAuthorCards();

  return (
    <div className={className ? `author-card-grid ${className}` : "author-card-grid"}>
      {authorCards.map(({ contributor, posts }) => (
        <AuthorCard key={`${isGuestContributor(contributor) ? "guest" : "user"}-${contributor.id}-${contributor.slug}`} contributor={contributor} storyCount={posts.length} showDescription={showDescriptions} />
      ))}
    </div>
  );
}
