import { AuthorBadge } from "@/components/AuthorBadge";
import { filterVisibleContentPosts } from "@/lib/content";
import { stripHtml } from "@/lib/format";
import {
  getAllAuthors,
  getAuthorHref,
  getAuthorPhoto,
  getAuthorProfile,
  getPostsByAuthor,
  type WordPressAuthor
} from "@/lib/wordpress";

async function getAuthorCards() {
  const authors = await getAllAuthors();
  const authorPosts = await Promise.all(
    authors.map(async (author) => ({
      author,
      posts: filterVisibleContentPosts(await getPostsByAuthor(author.id))
    }))
  );

  return authorPosts.sort((a, b) => b.posts.length - a.posts.length || a.author.name.localeCompare(b.author.name));
}

function AuthorCard({ author, storyCount }: { author: WordPressAuthor; storyCount: number }) {
  const profile = getAuthorProfile(author);
  const photo = getAuthorPhoto(author);
  const description = author.description ? stripHtml(author.description) : "Weekly Wildcat contributor";

  return (
    <article className="author-card">
      <a className="author-card-link" href={getAuthorHref(author)}>
        {photo ? (
          <img className="author-avatar" src={photo.url} alt={photo.alt || ""} width={photo.width ?? 96} height={photo.height ?? 96} />
        ) : (
          <div className="author-avatar author-avatar-fallback" aria-hidden="true">
            {author.name.slice(0, 1)}
          </div>
        )}
        <div>
          <div className="author-card-meta">
            {profile?.role ? <span>{profile.role}</span> : null}
            {profile?.founder ? <AuthorBadge label="Founder" /> : null}
          </div>
          <h2>{author.name}</h2>
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
      {authorCards.map(({ author, posts }) => (
        <AuthorCard key={author.id} author={author} storyCount={posts.length} />
      ))}
    </div>
  );
}
