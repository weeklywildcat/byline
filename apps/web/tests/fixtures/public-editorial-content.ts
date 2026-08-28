import type { WordPressPost } from "@/lib/wordpress";

const primaryAuthor = {
  id: 7,
  name: "Alex Rivera",
  slug: "alex-rivera",
  description: "News reporter.",
  avatar_urls: {}
};

export const publicEditorialPosts: WordPressPost[] = [
  {
    id: 101,
    date: "2026-08-20T09:00:00",
    date_gmt: "2026-08-20T16:00:00",
    modified: "2026-08-21T09:00:00",
    modified_gmt: "2026-08-21T16:00:00",
    slug: "public-records-guide",
    status: "publish",
    type: "post",
    link: "https://news.example.test/2026/08/20/news/public-records-guide/",
    title: { rendered: "Public records guide" },
    content: {
      rendered: '<p>The public story.</p><aside class="byline-correction-notice"><p class="byline-correction-notice-body">We corrected the meeting date.</p><time datetime="2026-08-21T09:00:00"></time></aside>'
    },
    excerpt: { rendered: "A public guide." },
    author: 7,
    featured_media: 0,
    categories: [1],
    tags: [],
    sticky: false,
    contributors: [
      { type: "user", id: 7, name: "Alex Rivera", slug: "alex-rivera", privateNote: "internal" },
      {
        type: "guest",
        id: 44,
        name: "Jordan Guest",
        slug: "jordan-guest",
        role: "Community contributor",
        bio: "A public guest bio.",
        email: "private@example.test",
        privateNote: "never publish",
        links: [
          { label: "Website", url: "https://jordan.example.test" },
          { label: "Email", url: "mailto:private@example.test" }
        ]
      }
    ],
    corrections: [
      { id: "legacy-copy", type: "correction", date: "2026-08-21T09:00:00", text: "We corrected the meeting date." },
      { id: "clarification-1", type: "clarification", date: "2026-08-22T09:00:00", text: "We clarified the public-records deadline." }
    ],
    _embedded: {
      author: [primaryAuthor],
      "wp:term": [[
        { id: 1, count: 1, description: "News", link: "https://news.example.test/category/news/", name: "News", slug: "news", taxonomy: "category", parent: 0 }
      ], []]
    }
  },
  {
    id: 202,
    date: "2026-08-22T09:00:00",
    date_gmt: "2026-08-22T16:00:00",
    modified: "2026-08-22T09:00:00",
    modified_gmt: "2026-08-22T16:00:00",
    slug: "private-assignment",
    status: "draft",
    type: "post",
    link: "https://news.example.test/private-assignment/",
    title: { rendered: "Private assignment" },
    content: { rendered: "<p>Not published.</p>" },
    excerpt: { rendered: "Not published." },
    author: 7,
    featured_media: 0,
    categories: [1],
    tags: [],
    sticky: false,
    corrections: [
      { id: "private-correction", type: "correction", date: "2026-08-23T09:00:00", text: "Private editorial note." }
    ],
    _embedded: {
      author: [primaryAuthor],
      "wp:term": [[
        { id: 1, count: 1, description: "News", link: "https://news.example.test/category/news/", name: "News", slug: "news", taxonomy: "category", parent: 0 }
      ], []]
    }
  }
];

export const publicEditorialCoverage = {
  id: 77,
  title: "Public records",
  slug: "public-records",
  description: "Reporting that helps readers understand public records.",
  overview: "<p>A public overview.</p><script>private()</script>",
  status: "active",
  public: true,
  staffIds: [7],
  storyIds: [101, 202],
  artwork: {
    id: 88,
    url: "https://news.example.test/uploads/public-records.jpg",
    alt: "Public records"
  },
  stories: [
    {
      id: 101,
      slug: "public-records-guide",
      title: "Public records guide",
      excerpt: "A public guide.",
      url: "https://news.example.test/2026/08/20/news/public-records-guide/",
      publishedAt: "2026-08-20T09:00:00",
      status: "publish"
    },
    {
      id: 202,
      slug: "private-assignment",
      title: "Private assignment",
      excerpt: "Not published.",
      url: "https://news.example.test/private-assignment/",
      publishedAt: "2026-08-22T09:00:00",
      status: "draft"
    }
  ]
};

export const publicEditorialRemoteCorrections = [
  { id: "remote-public", storyId: 101, type: "substantive-update", recordedAt: "2026-08-24T09:00:00", text: "We added a source link." },
  { id: "remote-private", storyId: 202, type: "correction", recordedAt: "2026-08-24T10:00:00", text: "Private correction." }
];
