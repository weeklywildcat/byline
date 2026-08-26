export type BylineStoryViewModel = {
  id: number;
  headline: string;
  href: string;
  excerpt?: string;
  authorName?: string;
  image?: {
    url: string;
    alt: string;
  } | null;
};

