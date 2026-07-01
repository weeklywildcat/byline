export type StaticPageAction = {
  label: string;
  href: string;
};

export type StaticPageSection = {
  title: string;
  body: string | string[];
  tone?: "featured";
  actions?: StaticPageAction[];
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
      "Weekly Wildcat believes every student deserves to see their school and community represented accurately, fairly and fully. We want our newsroom to include voices, experiences and stories that are often overlooked.",
    sections: [
      {
        title: "What This Means in Practice",
        body:
          "We will look beyond the easiest voices to quote and the most visible clubs, teams and leadership groups. That means seeking a range of perspectives, covering issues that affect different groups of students, avoiding stereotypes or tokenism, and making room for students whose stories are not always treated as front-page stories."
      },
      {
        title: "Accessibility",
        body:
          "Our website should be readable and usable for as many people as possible. We aim for clear typography, strong contrast, useful image alt text, captions or transcripts when possible, mobile-friendly pages and a clear way to report accessibility barriers when something is not working."
      },
      {
        title: "Inclusive Coverage Standards",
        body:
          "Writers should use people's stated names and pronouns, verify terminology when needed, avoid unnecessary identifiers and let people speak for themselves rather than being spoken about. Details about identity should appear when they are relevant to the story, not as decoration or assumption."
      },
      {
        title: "Help Us Do Better",
        body: [
          "Readers can suggest stories, flag coverage that felt inaccurate or exclusionary, request a correction, report an accessibility issue or share a concern without attaching their name.",
          "When you reach out, tell us what happened and how you would like your name handled. We will take the concern seriously, review it carefully and correct the record when needed."
        ],
        tone: "featured",
        actions: [{ label: "Share Feedback", href: "/contact/" }]
      },
      {
        title: "Join the Newsroom",
        body: [
          "Weekly Wildcat is open to students of any background or experience level. We need writers, photographers, designers, illustrators, video creators, social media contributors and students with story ideas.",
          "You do not have to arrive as an expert; you just have to be curious, fair and willing to learn."
        ],
        tone: "featured",
        actions: [{ label: "Join the Newsroom", href: "/join/" }]
      },
      {
        title: "Progress & Accountability",
        body:
          "This page is meant to grow with the newsroom. Each year, we can update it with coverage goals, accessibility improvements, newsroom policy changes and areas where Weekly Wildcat still needs to improve."
      }
    ]
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
