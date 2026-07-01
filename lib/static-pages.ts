export type StaticPageAction = {
  label: string;
  href: string;
};

export type StaticPageSection = {
  title: string;
  body: string;
};

export type StaticPage = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  sections: StaticPageSection[];
  actions?: StaticPageAction[];
};

export const STATIC_PAGES: StaticPage[] = [
  {
    slug: "about",
    title: "About Us",
    eyebrow: "Weekly Wildcat",
    description:
      "Weekly Wildcat is Ninety Six High School's official student newspaper, built by students to cover the people, events, ideas and moments that shape campus life.",
    sections: [
      {
        title: "Our Mission",
        body:
          "We publish student-centered reporting that is accurate, useful and rooted in the Ninety Six community. Our coverage includes school news, sports, opinion, features, arts and culture, and the everyday stories that make the school feel alive."
      },
      {
        title: "How We Work",
        body:
          "The newsroom is designed as a learning space for student writers, editors, photographers and designers. Stories are edited for clarity, fairness and accuracy before publication."
      }
    ],
    actions: [{ label: "Meet Our Writers", href: "/authors/" }]
  },
  {
    slug: "advertise",
    title: "Advertise with Us",
    eyebrow: "Partnerships",
    description:
      "Weekly Wildcat offers a local way to reach students, families, staff and community members who follow Ninety Six High School news.",
    sections: [
      {
        title: "Who We Reach",
        body:
          "Our audience includes students, parents, alumni, faculty, local businesses and community supporters who care about school news and student life."
      },
      {
        title: "Advertising Approach",
        body:
          "Advertising and sponsorship opportunities should support the publication while respecting the editorial independence of the student newsroom."
      }
    ],
    actions: [{ label: "Contact Us", href: "/contact/" }]
  },
  {
    slug: "join",
    title: "Join Our Team",
    eyebrow: "Newsroom",
    description:
      "Weekly Wildcat is open to students interested in writing, photography, design, editing, sports coverage, opinion, social media or campus storytelling.",
    sections: [
      {
        title: "Who Should Join",
        body:
          "You do not need to be a perfect writer to contribute. Curiosity, reliability, fairness and a willingness to revise are the qualities that matter most."
      },
      {
        title: "Ways to Contribute",
        body:
          "Students can report news, write columns, photograph events, cover games, build multimedia packages, pitch story ideas or help shape the look and feel of the publication."
      }
    ],
    actions: [{ label: "Get in Touch", href: "/contact/" }]
  },
  {
    slug: "leadership",
    title: "Leadership",
    eyebrow: "Newsroom",
    description:
      "Weekly Wildcat leadership helps guide coverage, edit stories, support contributors and keep the publication focused on useful student journalism.",
    sections: [
      {
        title: "Editorial Responsibility",
        body:
          "Editors and student leaders are responsible for helping stories become clear, fair and ready for publication while encouraging new voices across campus."
      },
      {
        title: "Staff Development",
        body:
          "Leadership is also about teaching: helping students learn interviewing, reporting, editing, photography, design, ethics and deadline habits."
      }
    ],
    actions: [{ label: "Join the Staff", href: "/join/" }]
  },
  {
    slug: "diversity-inclusion",
    title: "Diversity & Inclusion",
    eyebrow: "Standards",
    description:
      "Weekly Wildcat aims to reflect the full Ninety Six High School community with fairness, care and respect.",
    sections: [
      {
        title: "Coverage Commitment",
        body:
          "Student journalism is strongest when it includes many voices. We want our coverage to represent different grades, activities, teams, interests, backgrounds and perspectives."
      },
      {
        title: "Corrections and Care",
        body:
          "When a story misses context or needs correction, readers are encouraged to contact the newsroom so we can review the concern and improve the work."
      }
    ],
    actions: [{ label: "Contact the Newsroom", href: "/contact/" }]
  },
  {
    slug: "terms",
    title: "Terms of Service",
    eyebrow: "Policies",
    description:
      "These terms describe the basic expectations for using the Weekly Wildcat website and its published content.",
    sections: [
      {
        title: "Use of the Site",
        body:
          "Weekly Wildcat content is provided for school news, information and community engagement. Readers should not misuse the site, attempt to disrupt it or republish full articles without permission."
      },
      {
        title: "Editorial Content",
        body:
          "Articles, photos and other editorial materials are published for informational purposes. Opinions belong to the credited writers and do not necessarily represent every member of the school community."
      }
    ],
    actions: [{ label: "Privacy Policy", href: "/privacy/" }]
  },
  {
    slug: "privacy",
    title: "Privacy Policy",
    eyebrow: "Policies",
    description:
      "Weekly Wildcat keeps the website simple and avoids unnecessary collection of reader information.",
    sections: [
      {
        title: "Information We Use",
        body:
          "The public website is designed for reading school news. Basic analytics, hosting logs or embedded media providers may process standard technical information such as browser, device and page request data."
      },
      {
        title: "Student Privacy",
        body:
          "Because Weekly Wildcat serves a school community, student privacy and careful publishing judgment matter. Concerns about published information should be sent to the newsroom for review."
      }
    ],
    actions: [{ label: "Contact Us", href: "/contact/" }]
  },
  {
    slug: "contact",
    title: "Contact",
    eyebrow: "Newsroom",
    description:
      "Send questions, corrections, story ideas, advertising interest or newsroom inquiries to Weekly Wildcat.",
    sections: [
      {
        title: "School Address",
        body: "Weekly Wildcat, Ninety Six High School, 640 South Cambridge Street, Ninety Six, SC."
      },
      {
        title: "What to Send",
        body:
          "Readers can share story tips, correction requests, event information, sports updates, photo opportunities, advertising questions or ideas for future coverage."
      }
    ],
    actions: [
      { label: "Submit a Story Idea", href: "/contact/" },
      { label: "Join Our Team", href: "/join/" }
    ]
  }
];

export function getStaticPage(slug: string) {
  return STATIC_PAGES.find((page) => page.slug === slug) ?? null;
}
