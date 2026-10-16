import type { AboutIconName } from "./icons";

// Copy that changes with the newsroom lives here, apart from the page markup, so
// a future editor can update the timeline, standards or links without touching
// the layout. Sources for every claim are listed in docs/about-page.md.

// The dark "newsroom today" band (figures and editors). Hidden for now; set to true to bring it back.
export const SHOW_NEWSROOM_TODAY = false;

export const CONTENTS = [
  { id: "who-we-are", label: "Who we are" },
  { id: "history", label: "Our history" },
  { id: "coverage", label: "What we cover" },
  { id: "standards", label: "Standards and corrections" },
  { id: "funding", label: "Money and independence" },
  { id: "technology", label: "Behind the website" },
  { id: "get-involved", label: "Get involved" },
  { id: "explore", label: "Explore the Weekly Wildcat" }
] as const;

export const ROLES = [
  {
    title: "Reporters and writers",
    text: "Pitch stories, interview sources, cover games and events, and write the news, features, sports, arts and opinion."
  },
  {
    title: "Photographers and video makers",
    text: "Cover games, performances and campus life. Every photograph carries a credit."
  },
  {
    title: "Editors",
    text: "Assign stories, read drafts, check details, and decide on headlines, photos and when a story is ready to run."
  },
  {
    title: "Designers and illustrators",
    text: "Make the graphics and artwork that go with stories and shape how the paper looks."
  },
  {
    title: "Web and publishing",
    text: "Run the website and the tools the staff uses to schedule and publish."
  }
] as const;

// The first two entries come from the January 2026 story announcing the relaunch;
// the September 2025 approval is from the newsroom. Add to the end as the newsroom's history grows.
export const TIMELINE = [
  {
    when: "Mid-2000s",
    text: "A class called TV Communications produces a weekly student news broadcast at Ninety Six High School."
  },
  {
    when: "About 2022",
    text: "A group of students works with Mrs. Blackwell and Mr. Sprowl to restart a school newspaper. It fades as those students take on other activities and harder classes."
  },
  {
    when: "September 2025",
    text: "A new group of students works with Principal Sprowl and gets the newspaper approved."
  },
  {
    when: "January 2026",
    text: "The new staff publishes its first stories and introduces its leadership team.",
    storySlug: "a-new-era-for-student-journalism-nshs"
  }
] as const;

export const SECTIONS = [
  {
    slug: "news",
    label: "News",
    href: "/category/news/",
    text: "What is happening at school and in town, including the explanation behind an announcement, a schedule change or a new rule."
  },
  {
    slug: "sports",
    label: "Sports",
    href: "/category/sports/",
    text: "Game stories and results for Wildcat teams. Older results are kept in a separate archive."
  },
  {
    slug: "features",
    label: "Features",
    href: "/category/features/",
    text: "Longer pieces about people, programs and policies: how a rule works, who a program serves, what a drive is for."
  },
  {
    slug: "culture",
    label: "Arts & Culture",
    href: "/category/culture/",
    text: "Theatre, clubs and the traditions that make up school life."
  },
  {
    slug: "opinion",
    label: "Opinion",
    href: "/category/opinion/",
    text: "Columns and commentary, labeled as opinion so readers can tell them apart from reporting."
  }
] as const;

export const STANDARDS = [
  {
    term: "Accuracy",
    text: "Names, titles, scores and dates are checked before a story runs. Editors read drafts for details and context as well as for writing."
  },
  {
    term: "Fairness",
    text: "People we write about get a chance to respond. We try to quote more than the people who are easiest to reach."
  },
  {
    term: "Verification",
    text: "We report what we saw, what someone in a position to know told us, or what a document shows. A rumor does not go in as fact. If we cannot confirm something, we say so or leave it out."
  },
  {
    term: "Independence",
    text: "Sources, advertisers and supporters do not decide what we cover or how we describe it."
  },
  {
    term: "Transparency",
    text: "Stories carry bylines and photographs carry credits. Opinion is labeled as opinion. When a story changes after it is published, a note says what changed."
  },
  {
    term: "Responsible reporting",
    text: "Many of the people in our stories are classmates and teachers we will see the next morning. We weigh what a detail adds against what it could cost the person involved, and we take extra care with stories about students' health, safety or discipline."
  }
] as const;

export const INVOLVEMENT = [
  {
    audience: "Students",
    title: "Join the staff",
    text: "You do not need experience, and you do not need your own laptop. The newsroom keeps a few loaners for staff who need one.",
    href: "/join/",
    action: "How to join"
  },
  {
    audience: "Readers",
    title: "Send a story idea",
    text: "Tell us about an event, a rule change, a person or a problem that deserves coverage.",
    href: "/contact/",
    action: "Contact the newsroom"
  },
  {
    audience: "Anyone",
    title: "Ask for a correction",
    text: "Use the feedback form on the story, or write to us. You can ask us to keep your name private.",
    href: "/corrections/",
    action: "See published corrections"
  },
  {
    audience: "Businesses and supporters",
    title: "Advertise or help",
    text: "Local businesses and organizations can advertise. If you want to support the paper another way, tell us what you have in mind.",
    href: "/advertise/",
    action: "Advertising information"
  }
] as const;

export const EXPLORE: readonly {
  title: string;
  text: string;
  href: string;
  icon: AboutIconName;
}[] = [
  {
    title: "Diversity & Inclusion",
    text: "The publication's approach to representation and accessibility.",
    href: "/diversity-inclusion/",
    icon: "users-three"
  },
  {
    title: "Media Kit",
    text: "Official logos, photography, publication information and other media resources.",
    href: "/media-kit/",
    icon: "images"
  },
  {
    title: "Leadership",
    text: "The student editors and newsroom leadership.",
    href: "/leadership/",
    icon: "identification-badge"
  },
  {
    title: "Join the Newsroom",
    text: "Opportunities for students interested in contributing.",
    href: "/join/",
    icon: "pencil-line"
  },
  {
    title: "Advertising & Support",
    text: "Information for advertisers and anyone who wants to support the paper.",
    href: "/advertise/",
    icon: "megaphone-simple"
  },
  {
    title: "Contact the Newsroom",
    text: "Story ideas, corrections, questions and inquiries.",
    href: "/contact/",
    icon: "envelope-simple"
  }
];

// Stories cited in the prose and photographs shown on the page, by slug.
export const STORY_SLUGS = {
  relaunch: "a-new-era-for-student-journalism-nshs",
  websiteUpgrade: "moving-weekly-wildcat-from-wordpress-to-next-js",
  parking: "no-parking-pass-no-parking",
  attendance: "why-being-here-matters-mrs-bennett-on-attendance",
  megsHouse: "wildcat-courage-funding-the-fight-for-safety",
  fca: "fca-athlete-breakfast-2026",
  edgewood: "from-a-last-minute-video-to-a-national-finish"
} as const;

export const PHOTOS = {
  sports: {
    slug: "ninety-six-shuts-out-thornwell-63-0-its-fourth-straight-win",
    alt: "A Ninety Six football player in a maroon No. 52 jersey high-fives a coach on the sideline at night, with the stadium scoreboard behind them."
  },
  culture: {
    slug: "finding-a-place-in-the-spotlight",
    alt: "Student performers stand in a line on a stage with their hands joined and raised, taking a bow after a show."
  },
  website: {
    slug: "moving-weekly-wildcat-from-wordpress-to-next-js",
    alt: "A hand holds an iPhone showing the Weekly Wildcat homepage in front of a background of code."
  }
} as const;

// Staff photographs kept in public/newsroom, resized to three widths with metadata
// removed. Credits follow each file's own metadata. Describe what is visible; names in captions come from the
// newsroom; keep alt text to what is visible.
export const NEWSROOM_PHOTOS = [
  {
    file: "newsroom-tablet",
    width: 1600,
    height: 2000,
    alt: "A staff member with a green lanyard sits at a table in front of a white tablet in a folding case, looking off to the side.",
    caption: "Matt Cebedo listens in during a staff meeting.",
    credit: "NSHS Yearbook"
  },
  {
    file: "newsroom-meeting",
    width: 1600,
    height: 1067,
    alt: "A staff member in a pink shirt holds a stylus over a tablet while a second staff member watches, seated at a conference table.",
    caption: "Jeremy Lauten and Maycie Krajewski plan the publishing schedule.",
    credit: "Gibson Bell for Weekly Wildcat"
  },
  {
    file: "newsroom-laughing",
    width: 1600,
    height: 2000,
    alt: "A staff member with a laptop and a water bottle in front of her laughs and looks up and to the side.",
    caption: "Caroline Elrod discusses branding ideas with the staff.",
    credit: "NSHS Yearbook"
  }
] as const;
