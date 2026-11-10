"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from "@byline/newsroom-ui/ui/sidebar";
import { CreateMenu } from "./CreateMenu";
import { BylineMark } from "./DefaultSidebar";
import { NAV_ICONS, type ShellSidebarProps } from "./nav-items";
import { ShellLink } from "./navigation";
import { NavUser } from "./NavUser";

/**
 * The global Byline navigation as an icon rail: shadcn sidebar-09's first
 * inner sidebar (`collapsible="none"`, the icon width plus its border). The
 * same destinations, Create and account as the ordinary sidebar, icons only
 * whatever state the sidebar around it is in, so every control is named by
 * an always-available tooltip and its accessible label. Any destination
 * leaves the workspace for that ordinary Byline screen.
 */
export function BylineIconRail({ items, active, homeHref, user, systemHref, logoutUrl, loginHref }: ShellSidebarProps & { active: string | null }) {
  return (
    <Sidebar collapsible="none" className="w-[calc(var(--sidebar-width-icon)+1px)]! border-r border-sidebar-border" data-byline-rail="">
      <SidebarHeader className="any-pointer-coarse:px-0.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip={{ children: "Weekly Wildcat Home", hidden: false }} render={<ShellLink href={homeHref} aria-label="Weekly Wildcat Home" />} className="md:h-8 md:p-0 any-pointer-coarse:justify-center">
              <BylineMark />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <CreateMenu compact />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Byline">
          <SidebarGroup className="any-pointer-coarse:px-0.5">
            <SidebarGroupContent className="px-1.5 md:px-0">
              <SidebarMenu className="gap-0.5">
                {items.map((item, index) => {
                  const Icon = NAV_ICONS[item.key];
                  const firstPublish = item.group === "publish" && items[index - 1]?.group !== "publish";
                  const current = item.key === active;
                  return (
                    <SidebarMenuItem key={item.key} className={firstPublish ? "mt-2 border-t pt-2" : undefined}>
                      <SidebarMenuButton
                        isActive={current}
                        tooltip={{ children: item.label, hidden: false }}
                        className="px-2.5 md:px-2 any-pointer-coarse:justify-center"
                        render={<ShellLink href={item.href} aria-current={current ? "page" : undefined} />}
                      >
                        {Icon ? <Icon aria-hidden="true" /> : null}
                        <span className="sr-only">{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter className="any-pointer-coarse:px-0.5">
        <NavUser compact user={user} systemHref={systemHref} logoutUrl={logoutUrl} loginHref={loginHref} />
      </SidebarFooter>
    </Sidebar>
  );
}
