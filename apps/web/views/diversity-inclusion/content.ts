import type { ExploreCard } from "@/components/ExploreCards";

// Stories the page points to, by slug. If one is unpublished the link is dropped.
export const DI_STORIES = {
  directors: "three-juniors-take-on-a-new-role-directing-their-classmates-in-need-a-lift",
  edgewood: "from-a-last-minute-video-to-a-national-finish"
} as const;

export const RELATED: readonly ExploreCard[] = [
  {
    title: "About the Weekly Wildcat",
    text: "Who runs the paper, where it came from and what it covers.",
    href: "/about/",
    icon: "newspaper-clipping"
  },
  {
    title: "Join the Newsroom",
    text: "Who can join, how to start and answers to common questions.",
    href: "/join/",
    icon: "pencil-line"
  },
  {
    title: "Leadership",
    text: "How the student editors run the newsroom.",
    href: "/leadership/",
    icon: "identification-badge"
  },
  {
    title: "Contact the Newsroom",
    text: "Story ideas, concerns, corrections and questions.",
    href: "/contact/",
    icon: "envelope-simple"
  }
];
