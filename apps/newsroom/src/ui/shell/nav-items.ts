import { CalendarDays, FileText, HeartPulse, House, Images, KanbanSquare, Layers, MessageSquareText, Newspaper, Users, Vote, type LucideIcon } from "lucide-react";
import type { ShellUser } from "./NavUser";

export type ShellNavLink = { key: string; label: string; path: string; href: string; exact?: boolean; group?: "publish" };

/** Everything both sidebar compositions show: destinations, the account, and its menu's addresses. */
export type ShellSidebarProps = {
  items: ShellNavLink[];
  adminRoute: string;
  homeHref: string;
  user: ShellUser;
  systemHref: string | null;
  logoutUrl: string;
  loginHref: string;
};

/** One icon per destination, ready for each screen as it lands in NAVIGATION. */
export const NAV_ICONS: Record<string, LucideIcon> = {
  home: House,
  stories: FileText,
  planning: KanbanSquare,
  calendar: CalendarDays,
  media: Images,
  collections: Layers,
  people: Users,
  polls: Vote,
  feedback: MessageSquareText,
  "front-page": Newspaper,
  "content-health": HeartPulse
};
