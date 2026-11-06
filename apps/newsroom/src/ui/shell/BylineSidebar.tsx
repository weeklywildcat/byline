"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@byline/newsroom-ui/ui/sidebar";
import { CalendarDays, FileText, House, Images, KanbanSquare, MessageSquareText, Radio, Users, Vote, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeNavKey } from "../../domain/navigation";
import { CreateMenu } from "./CreateMenu";
import { NavUser, type ShellUser } from "./NavUser";

export type ShellNavLink = { key: string; label: string; path: string; href: string };

/** One icon per destination, ready for each screen as it lands in NAVIGATION. */
const ICONS: Record<string, LucideIcon> = {
  home: House,
  stories: FileText,
  planning: KanbanSquare,
  calendar: CalendarDays,
  media: Images,
  coverage: Radio,
  people: Users,
  polls: Vote,
  feedback: MessageSquareText
};

/**
 * The global Byline sidebar: shadcn's application-shell Sidebar (collapsible
 * to icons on desktop, an off-canvas sheet on phones), rendered by Payload's
 * `admin.components.Nav`. Wordmark, Create, the newsroom destinations, and
 * the account menu in the footer. Nothing here names Payload.
 */
export function BylineSidebar({ items, adminRoute, homeHref, user, systemHref, logoutUrl, loginHref }: {
  items: ShellNavLink[];
  adminRoute: string;
  homeHref: string;
  user: ShellUser;
  systemHref: string | null;
  logoutUrl: string;
  loginHref: string;
}) {
  const pathname = usePathname() ?? "";
  const active = activeNavKey(items, pathname, adminRoute);

  return (
    <AdminRoot className="byline-shell-nav" toaster={false}>
      <Sidebar collapsible="icon" mobileTitle="Byline" mobileDescription="Newsroom navigation and account">
        <SidebarHeader className="gap-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="Byline Home" render={<Link href={homeHref} prefetch={false} aria-label="Byline Home" />} className="md:h-10">
                <span aria-hidden="true" className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-foreground font-heading text-base font-semibold text-background">B</span>
                <span className="truncate font-heading text-base font-semibold tracking-tight">Byline</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <CreateMenu />
        </SidebarHeader>
        <SidebarContent>
          <nav aria-label="Byline">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((item) => <NavLink key={item.key} item={item} active={item.key === active} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </nav>
        </SidebarContent>
        <SidebarFooter>
          <NavUser user={user} systemHref={systemHref} logoutUrl={logoutUrl} loginHref={loginHref} />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </AdminRoot>
  );
}

function NavLink({ item, active }: { item: ShellNavLink; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = ICONS[item.key];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<Link href={item.href} prefetch={false} aria-current={active ? "page" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }} />}
      >
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
