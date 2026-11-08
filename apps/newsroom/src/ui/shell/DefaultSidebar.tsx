"use client";

import {
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
import { CreateMenu } from "./CreateMenu";
import { NAV_ICONS, type ShellNavLink, type ShellSidebarProps } from "./nav-items";
import { ShellLink } from "./navigation";
import { NavUser } from "./NavUser";

/**
 * The ordinary global sidebar's contents (inside BylineSidebar's one
 * `<Sidebar collapsible="icon">`): wordmark, Create, the newsroom
 * destinations, and the account menu in the footer. Collapses to icons on
 * desktop and is the off-canvas sheet on phones.
 */
export function DefaultSidebar({ items, active, homeHref, user, systemHref, logoutUrl, loginHref }: ShellSidebarProps & { active: string | null }) {
  return (
    <>
      <SidebarHeader className="gap-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Byline Home" render={<ShellLink href={homeHref} aria-label="Byline Home" />} className="md:h-10">
              <BylineMark />
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
    </>
  );
}

/** The "B" wordmark tile, shared by both compositions. */
export function BylineMark() {
  return <span aria-hidden="true" className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-foreground font-heading text-base font-semibold text-background">B</span>;
}

function NavLink({ item, active }: { item: ShellNavLink; active: boolean }) {
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
    </SidebarMenuItem>
  );
}
