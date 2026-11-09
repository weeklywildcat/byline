"use client";

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar
} from "@byline/newsroom-ui/ui/sidebar";
import { storiesHref } from "@byline/newsroom-screens/planning/planning-api";
import { builtInStoryView, SIDEBAR_STORY_VIEWS } from "@byline/newsroom-screens/planning/story-views";
import { BookmarkCheck, ImageOff, UserX, type LucideIcon } from "lucide-react";
import { CreateMenu } from "./CreateMenu";
import { NAV_ICONS, type ShellNavLink, type ShellSidebarProps } from "./nav-items";
import { useNavigationCounts } from "./navigation-counts";
import { ShellLink } from "./navigation";
import { NavUser } from "./NavUser";
import { WeeklyWildcatLogo } from "./WeeklyWildcatLogo";

/**
 * The ordinary global sidebar's contents (inside BylineSidebar's one
 * `<Sidebar collapsible="icon">`): wordmark, Create, the newsroom
 * destinations, and the account menu in the footer. Collapses to icons on
 * desktop and is the off-canvas sheet on phones.
 */
export function DefaultSidebar({ items, active, homeHref, user, systemHref, logoutUrl, loginHref }: ShellSidebarProps & { active: string | null }) {
  const counts = useNavigationCounts();
  const stories = items.find((item) => item.key === "stories");
  const countFor = (key: string) => key === "stories" || key === "media" || key === "collections" ? counts?.[key] : undefined;
  return (
    <>
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Weekly Wildcat Home" render={<ShellLink href={homeHref} aria-label="Weekly Wildcat Home" />} className="h-14 md:h-14">
              {/* The menu button sizes every svg inside it as a 16px icon; the logo keeps its own size. */}
              <span className="flex h-12 shrink-0 items-center text-sidebar-foreground group-data-[collapsible=icon]:hidden"><WeeklyWildcatLogo className="h-12! w-auto!" /></span>
              <span className="hidden size-8 shrink-0 items-center justify-center text-sidebar-foreground group-data-[collapsible=icon]:flex"><WeeklyWildcatLogo mark className="size-7!" /></span>
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
                {items.filter((item) => !item.group).map((item) => <NavLink key={item.key} item={item} active={item.key === active} count={countFor(item.key)} />)}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {items.some((item) => item.group === "publish") ? (
            <SidebarGroup>
              <SidebarGroupLabel>Publish</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.filter((item) => item.group === "publish").map((item) => <NavLink key={item.key} item={item} active={item.key === active} />)}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </nav>
        {stories ? <SavedViews storiesHref={stories.href} counts={counts?.views} /> : null}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} systemHref={systemHref} logoutUrl={logoutUrl} loginHref={loginHref} />
      </SidebarFooter>
      <SidebarRail />
    </>
  );
}

/** The publication's paw mark, for the narrow icon rail. */
export function BylineMark() {
  return <span aria-hidden="true" className="flex aspect-square size-8 shrink-0 items-center justify-center text-sidebar-foreground"><WeeklyWildcatLogo mark className="size-7!" /></span>;
}

/** Story Views icons; each view is a built-in from story-views.ts, linked as Stories filters. */
const VIEW_ICONS: Record<string, LucideIcon> = { review: BookmarkCheck, unassigned: UserX, "art-needed": ImageOff };

/**
 * Promoted Stories views with their counts: shortcuts into Stories already
 * filtered (the address names the filters, so Stories opens on that view).
 */
function SavedViews({ storiesHref: base, counts }: { storiesHref: string; counts?: Record<string, number> }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Saved views</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {SIDEBAR_STORY_VIEWS.map((id) => {
            const view = builtInStoryView(id);
            if (!view) return null;
            const Icon = VIEW_ICONS[id];
            const count = counts?.[id];
            return (
              <SidebarMenuItem key={id}>
                <SidebarMenuButton tooltip={view.label} render={<ShellLink href={storiesHref(base, view.filters)} onClick={() => { if (isMobile) setOpenMobile(false); }} />}>
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  <span>{view.label}</span>
                </SidebarMenuButton>
                {count !== undefined ? <SidebarMenuBadge className="text-muted-foreground tabular-nums" aria-label={`${count} ${count === 1 ? "story" : "stories"}`}>{count}</SidebarMenuBadge> : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavLink({ item, active, count }: { item: ShellNavLink; active: boolean; count?: number }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icon = NAV_ICONS[item.key];
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<ShellLink href={item.href} aria-current={active ? "page" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }} />}
      >
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{item.label}</span>
      </SidebarMenuButton>
      {count !== undefined ? <SidebarMenuBadge className="text-muted-foreground tabular-nums" aria-label={`${count} open`}>{count}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  );
}
