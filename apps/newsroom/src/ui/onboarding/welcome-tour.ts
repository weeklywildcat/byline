import { CALENDAR_PATH, MEDIA_PATH, STORIES_PATH } from "../../domain/navigation";
import type { TourContext, TourStepDefinition } from "./tour-registry";

const list = (items: readonly string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`);

/** Media has its own tab only where the header has room; elsewhere it is under More. */
const mediaTab = (context: TourContext) => context.visible("nav-media");

/**
 * The first-run walkthrough: a handful of moments on the real interface, no
 * story needed and nothing created or changed. Screens are opened by the
 * reader through the real navigation (so the shell's unsaved-work guard still
 * applies). Anything an editor has beyond staff is one short pointer, and only
 * to destinations their navigation actually shows.
 */
export const welcomeTourSteps: readonly TourStepDefinition[] = [
  {
    id: "home",
    moment: "home",
    title: "This is your newsroom",
    description: "Home brings together your work and anything that needs your attention today.",
    targets: ["home-screen"],
    screen: "",
    place: "Home"
  },
  {
    id: "create",
    moment: "create",
    title: "Start something",
    description: "New stories, tasks and uploads all begin from Create, wherever you are.",
    targets: ["create"]
  },
  {
    id: "search",
    moment: "search",
    title: "Find anything",
    description: (context) => `Search stories, people and collections from anywhere. ${context.modifier === "⌘" ? "⌘K" : "Ctrl K"} opens it too.`,
    targets: ["search"]
  },
  {
    id: "stories-nav",
    moment: "stories",
    title: "Stories",
    description: "Everything the newsroom is working on lives in Stories.",
    targets: ["nav-stories"],
    action: { instruction: "Open Stories to continue.", to: STORIES_PATH }
  },
  {
    id: "stories",
    moment: "stories",
    title: "Stories move through the desk",
    description: "Each story goes from Pitch to Reporting, Drafting, Review and Ready, so you can see where everything stands.",
    targets: ["stories-screen"],
    screen: STORIES_PATH,
    place: "Stories"
  },
  {
    id: "calendar-nav",
    moment: "calendar",
    title: "Calendar",
    description: "The Calendar keeps the newsroom’s dates in one place.",
    targets: ["nav-calendar"],
    action: { instruction: "Open Calendar to continue.", to: CALENDAR_PATH }
  },
  {
    id: "calendar",
    moment: "calendar",
    title: "See the week ahead",
    description: "Interviews, events and deadlines sit side by side, so you can plan the week and nothing sneaks up on you.",
    targets: ["calendar-screen"],
    screen: CALENDAR_PATH,
    place: "Calendar"
  },
  {
    id: "media-nav",
    moment: "media",
    title: "Media",
    description: "Photos, files and production work are kept in Media.",
    targets: ["nav-media"],
    action: { instruction: "Open Media to continue.", to: MEDIA_PATH },
    include: mediaTab
  },
  {
    id: "media",
    moment: "media",
    title: "Photos and files",
    description: "The Library holds photos and files; Work shows who is shooting, designing or editing what.",
    targets: ["media-screen"],
    screen: MEDIA_PATH,
    place: "Media",
    include: mediaTab
  },
  {
    id: "desks",
    moment: "desks",
    title: "Your editor tools",
    description: (context) => `People${context.publishDesks.length ? ` and the publishing desks (${list(context.publishDesks)})` : ""} are in your navigation too.`,
    targets: ["nav-people", "more"],
    minimumRole: "editor",
    include: (context) => context.navigation.has("people")
  },
  {
    id: "account",
    moment: "account",
    title: "Your account",
    description: "Your profile, Field Mode and keyboard shortcuts live here. So does this tour, if you want to see it again.",
    targets: ["account"],
    include: (context) => context.visible("account")
  },
  {
    // Narrower screens keep the account (and, on phones, Media) under More.
    id: "more",
    moment: "account",
    title: "Everything else is in More",
    description: (context) => `${!mediaTab(context) && context.navigation.has("media") ? "Media, your" : "Your"} profile, Field Mode, keyboard shortcuts and this tour are under More whenever you need them.`,
    targets: ["more"],
    include: (context) => !context.visible("account")
  },
  {
    id: "done",
    moment: "done",
    title: "You’re ready.",
    description: "That’s the newsroom. The rest you’ll pick up as you go.",
    final: true
  }
];
