import { getNativeSnapshot, nativeStoryIndex } from "@/lib/native-snapshot";
import { nativeImage } from "@/lib/native-article";
import { ContributorDirectoryCard } from "@byline/ui/contributor-profile";
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
  const photo = getContributorPhoto(contributor);
  const description = stripHtml(getContributorDescription(contributor)) || `${getPublicationConfig().identity.shortName} contributor`;
  return <ContributorDirectoryCard person={{ name: contributor.name, role: getContributorRole(contributor), photo: photo ? { ...photo, url: getPresentationMediaUrl(photo.url) } : null }} href={getContributorHref(contributor)} description={showDescription ? description : undefined} storyCount={storyCount} />;
}

type AuthorDirectoryProps = {
  className?: string;
  // The bio, or a generic fallback when there is none. The author's own page
  // carries the full bio, so the directory can leave it out.
  showDescriptions?: boolean;
};

export async function AuthorDirectory({ className, showDescriptions = true }: AuthorDirectoryProps) {
  const native = getNativeSnapshot();
  if (native) {
    const { byContributor } = nativeStoryIndex()!;
    const people = native.datasets.people.filter((person) => person.directoryVisible).map((person) => ({
      person, storyCount: byContributor.get(`person:${person.id}`)?.length ?? 0
    })).sort((a, b) => b.storyCount - a.storyCount || a.person.name.localeCompare(b.person.name));
    return (
      <div className={className ? `author-card-grid ${className}` : "author-card-grid"}>
        {people.map(({ person, storyCount }) => {
          const image = person.portrait ? nativeImage(person.portrait, { role: "contributor", shape: "square", sizes: "96px", priority: false, searchVisibility: "presentation" }) : null;
          const photo = image ? { ...image, url: image.src } : null;
          const description = showDescriptions ? person.bio || person.shortBio || `${native.publication.identity.shortName} contributor` : undefined;
          return <ContributorDirectoryCard key={person.id} person={{ name: person.name, role: person.newsroomRole, photo }}
            href={person.hasProfilePage ? `/author/${person.slug}/` : null} description={description} storyCount={storyCount} />;
        })}
      </div>
    );
  }
  const authorCards = await getAuthorCards();

  return (
    <div className={className ? `author-card-grid ${className}` : "author-card-grid"}>
      {authorCards.map(({ contributor, posts }) => (
        <AuthorCard key={`${isGuestContributor(contributor) ? "guest" : "user"}-${contributor.id}-${contributor.slug}`} contributor={contributor} storyCount={posts.length} showDescription={showDescriptions} />
      ))}
    </div>
  );
}
