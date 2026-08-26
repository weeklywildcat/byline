import { getPublicationNavigation, normalizePublicationConfig, type BylinePublicationConfig } from "@byline/core";

export const WEEKLY_WILDCAT_PUBLICATION: BylinePublicationConfig = {
  schemaVersion: 1,
  revision: 0,
  identity: {
    name: "Weekly Wildcat",
    shortName: "Weekly Wildcat",
    description: "Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.",
    organizationName: "Ninety Six High School",
    tagline: "Ninety Six High School's Official Student Newspaper"
  },
  location: {
    display: "Ninety Six, S.C.",
    city: "Ninety Six",
    region: "South Carolina",
    country: "US",
    address: "640 South Cambridge Street, Ninety Six, SC"
  },
  locale: "en-US",
  timezone: "America/New_York",
  urls: {
    publicSite: "https://weeklywildcat.com",
    cms: "https://cms.weeklywildcat.com",
    contact: "/contact/"
  },
  branding: {
    masthead: { url: "/brand/weekly-wildcat-wide-logo.svg", alt: "Weekly Wildcat", width: null, height: null },
    logo: { url: "/brand/weekly-wildcat-logo.svg", alt: "Weekly Wildcat", width: null, height: null },
    organizationLogo: { url: "/organization-logo.png", alt: "Ninety Six High School", width: 1024, height: 1024 },
    icons: [
      { url: "/favicon-32.png", alt: "", width: 32, height: 32 },
      { url: "/icon-192.png", alt: "", width: 192, height: 192 },
      { url: "/icon-512.png", alt: "", width: 512, height: 512 },
      { url: "/apple-touch-icon.png", alt: "", width: 180, height: 180 }
    ],
    defaultSocialImage: { url: "/media-kit/open-graph-social.png", alt: "Weekly Wildcat", width: 1200, height: 600 }
  },
  appearance: { theme: "weekly-wildcat", tokenOverrides: {} },
  sections: [
    { name: "News", slug: "news", description: "", active: true },
    { name: "Sports", slug: "sports", description: "", active: true },
    { name: "Opinion", slug: "opinion", description: "", active: true },
    { name: "Features", slug: "features", description: "", active: true },
    { name: "Arts & Culture", slug: "culture", description: "", active: true }
  ],
  navigation: [
    { label: "News", url: "/category/news/", locations: ["header"] },
    { label: "Sports", url: "/sports/", locations: ["header"], feature: "sports" },
    { label: "Opinion", url: "/category/opinion/", locations: ["header"] },
    { label: "Features", url: "/category/features/", locations: ["header"] },
    { label: "News", url: "/category/news/", locations: ["footer"], group: "Columns" },
    { label: "Features", url: "/category/features/", locations: ["footer"], group: "Columns" },
    { label: "Opinion", url: "/category/opinion/", locations: ["footer"], group: "Columns" },
    { label: "Arts & Culture", url: "/category/culture/", locations: ["footer"], group: "Columns" },
    { label: "Sports", url: "/sports/", locations: ["footer"], group: "Columns", feature: "sports" },
    { label: "Terms & Service", url: "/terms/", locations: ["footer"], group: "Policies" },
    { label: "Privacy Policy", url: "/privacy/", locations: ["footer"], group: "Policies" },
    { label: "About us", url: "/about/", locations: ["footer"], group: "About" },
    { label: "Media Kit", url: "/media-kit/", locations: ["footer"], group: "About" },
    { label: "Advertise with Us", url: "/advertise/", locations: ["footer"], group: "About" },
    { label: "Join our team", url: "/join/", locations: ["footer"], group: "About" },
    { label: "Leadership", url: "/leadership/", locations: ["footer"], group: "About" },
    { label: "Diversity & Inclusion", url: "/diversity-inclusion/", locations: ["footer"], group: "About" }
  ],
  social: [
    { service: "instagram", label: "Instagram", url: "https://www.instagram.com/theweeklywildcat" },
    { service: "tiktok", label: "TikTok", url: "https://www.tiktok.com/@weeklywildcat" }
  ],
  features: { sports: true, events: true, polls: true, newsletter: true, discord: true },
  licensing: {
    copyrightNotice: "© Weekly Wildcat",
    imageLicenseUrl: "/image-license/",
    acquireLicensePage: "/image-license/"
  },
  seo: {
    defaultTitle: "Weekly Wildcat",
    defaultDescription: "Student journalism from the Weekly Wildcat newsroom in Ninety Six, South Carolina.",
    organizationType: "Organization"
  }
};

function configuredPublication(): unknown {
  const serialized = process.env.BYLINE_PUBLICATION_JSON;
  if (!serialized) return WEEKLY_WILDCAT_PUBLICATION;

  try {
    return JSON.parse(serialized);
  } catch {
    return WEEKLY_WILDCAT_PUBLICATION;
  }
}

const publication = normalizePublicationConfig(configuredPublication(), WEEKLY_WILDCAT_PUBLICATION);

export function getPublicationConfig() {
  return publication;
}

export function getNavigation(location: "header" | "footer") {
  return getPublicationNavigation(publication, location);
}
