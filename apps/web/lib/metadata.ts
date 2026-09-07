export type SocialImage = string | {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
};

export type RobotsPolicy = {
  index?: boolean;
  follow?: boolean;
  "max-snippet"?: number;
  "max-image-preview"?: "none" | "standard" | "large";
  "max-video-preview"?: number;
};

export type Metadata = {
  metadataBase?: URL;
  title?: string | { default: string; template: string };
  description?: string;
  alternates?: { canonical?: string; types?: Record<string, string> };
  robots?: RobotsPolicy & { googleBot?: RobotsPolicy };
  icons?: {
    icon?: Array<{ url: string; sizes?: string; type?: string }>;
    apple?: Array<{ url: string; sizes?: string; type?: string }>;
  };
  openGraph?: {
    title?: string;
    description?: string;
    url?: string;
    siteName?: string;
    locale?: string;
    type?: "website" | "article" | "profile";
    images?: SocialImage[];
    publishedTime?: string;
    modifiedTime?: string;
    authors?: string[];
    section?: string;
    tags?: string[];
  };
  twitter?: {
    card?: "summary" | "summary_large_image";
    title?: string;
    description?: string;
    images?: SocialImage[];
  };
};

export type SitemapEntry = {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

export type RobotsDocument = {
  rules: { userAgent: string; allow?: string; disallow?: string } | Array<{ userAgent: string; allow?: string; disallow?: string }>;
  host?: string;
  sitemap?: string | string[];
};
