"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { SidebarTrigger, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { ChevronLeft, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { locationFor, storyIdFromPath } from "../../domain/navigation";
import type { Role } from "../../domain/vocabulary";
import { HeaderCreate } from "./CreateMenu";
import { usePrimaryLocation } from "./layout";
import { ShellLink } from "./navigation";
import { PrimaryNavigation } from "./PrimaryNavigation";
import { useNewsroomRoutes } from "./account";
import { NewsroomPresence } from "./NewsroomPresence";
import { NotificationsBell } from "./NotificationsBell";
import { useBylineSearch } from "./search";
import { useModifierLabel } from "./shortcuts";
import { useStoryCrumb } from "./story-crumb";
import { WeeklyWildcatLogo } from "./WeeklyWildcatLogo";

/**
 * The Byline app header (`admin.components.header`): sticky above every admin
 * view, offset by the sidebar's current width so it sits beside it as in
 * shadcn's dashboard shell. On narrower Byline views it hosts the primary
 * navigation and Create.
 *
 * View controls stay with their views: Story publishing is StoryHeader's,
 * Home's contextual "Task" is in My Work. Nothing here duplicates them.
 */
export function BylineHeaderBar(props: { role: Role; hasProfile: boolean; loginHref: string }) {
  return (
    <AdminRoot className="byline-app-header" toaster={false}>
      <HeaderBar {...props} />
    </AdminRoot>
  );
}

function HeaderBar({ role, hasProfile, loginHref }: { role: Role; hasProfile: boolean; loginHref: string }) {
  const pathname = usePathname() ?? "";
  const routes = useNewsroomRoutes();
  const { state, isMobile } = useSidebar();
  const { openSearch } = useBylineSearch();
  const modifier = useModifierLabel();
  const primary = usePrimaryLocation(routes.admin);
  const home = primary?.key === "home";
  const story = useStoryCrumb(storyIdFromPath(pathname, routes.admin));
  // On a Story the last crumb is the Story itself (its live headline), and a focused mode adds its own name after it.
  const crumbs: Array<{ label: string; path?: string; action?: () => void }> = locationFor(pathname, routes.admin).map((crumb) => (story && crumb.label === "Story" ? { label: story.title.trim() || "Untitled story" } : crumb));
  if (story?.mode && crumbs.length) {
    const last = crumbs[crumbs.length - 1]!;
    crumbs[crumbs.length - 1] = { ...last, ...(story.openStory ? { action: story.openStory } : {}) };
    crumbs.push({ label: story.mode });
  }

  return (
    <header
      className={cn(
        "byline-header-row h-12 items-center gap-2 border-b border-border bg-background/95 px-3 lg:px-4",
        primary
          ? "byline-adaptive-header min-[1200px]:motion-safe:transition-[margin] min-[1200px]:duration-200 min-[1200px]:ease-linear min-[1200px]:backdrop-blur-sm min-[1200px]:supports-backdrop-filter:bg-background/80"
          : "md:motion-safe:transition-[margin] md:duration-200 md:ease-linear backdrop-blur-sm supports-backdrop-filter:bg-background/80",
        home && "byline-header-home",
        !isMobile && (state === "collapsed" ? "md:ml-(--sidebar-width-icon)" : "md:ml-(--sidebar-width)")
      )}
    >
      <div className="byline-header-location">
        <div className="byline-header-sidebar-trigger shrink-0 items-center gap-2">
          <SidebarTrigger className="-ml-1" label="Toggle navigation" title={`Toggle navigation (${modifier}\\)`} aria-keyshortcuts="Control+\ Meta+\" />
          {crumbs.length > 0 && <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-auto" />}
        </div>
        {primary?.parent && (
          <ShellLink href={`${routes.admin}${primary.parent.path}` || "/"} aria-label={`Back to ${primary.parent.label}`} className={buttonVariants({ variant: "ghost", size: "icon", className: "byline-header-back size-11 shrink-0" })}>
            <ChevronLeft aria-hidden="true" />
          </ShellLink>
        )}
        {home && <WeeklyWildcatLogo className="byline-header-wordmark" />}
        {crumbs.length ? (
          <Breadcrumb className={cn("min-w-0", home && "byline-header-home-title")}>
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <BreadcrumbSeparator className={primary?.parent && crumbs[index - 1]?.path === primary.parent.path ? "byline-adaptive-parent-crumb" : undefined} /> : null}
                  <BreadcrumbItem className={cn("min-w-0", primary?.parent && crumb.path === primary.parent.path && "byline-adaptive-parent-crumb")}>
                    {crumb.action && index < crumbs.length - 1 ? (
                      <BreadcrumbLink className="max-w-[min(100%,20ch)] truncate" render={<button type="button" onClick={crumb.action} />}>{crumb.label}</BreadcrumbLink>
                    ) : crumb.path !== undefined && index < crumbs.length - 1 ? (
                      <BreadcrumbLink render={<ShellLink href={`${routes.admin}${crumb.path}`} />}>{crumb.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="max-w-[min(100%,28ch)] truncate font-medium" title={crumb.label}>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        ) : null}
      </div>
      {primary && <PrimaryNavigation admin={routes.admin} role={role} active={primary.key} hasProfile={hasProfile} loginHref={loginHref} logoutUrl={`${routes.api}/users/logout`} />}
      <div className="byline-header-actions ml-auto flex shrink-0 items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openSearch} aria-keyshortcuts="Control+K Meta+K" className="byline-header-search justify-start text-muted-foreground sm:w-56" data-shell-search="">
          <Search data-icon="inline-start" aria-hidden="true" />
          <span className="byline-search-label max-sm:sr-only">Search</span>
          <KbdGroup className="ml-auto max-sm:hidden" aria-hidden="true"><Kbd>{modifier}</Kbd><Kbd>K</Kbd></KbdGroup>
        </Button>
        <NotificationsBell />
        {primary && <HeaderCreate />}
        <NewsroomPresence isMobile={isMobile} />
      </div>
    </header>
  );
}
