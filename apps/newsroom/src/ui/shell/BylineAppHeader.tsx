"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Kbd, KbdGroup } from "@byline/newsroom-ui/ui/kbd";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { SidebarTrigger, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useSyncExternalStore } from "react";
import { locationFor } from "../../domain/navigation";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { useBylineSearch } from "./search";

const subscribeNothing = () => () => {};
/** ⌘ on Apple devices, Ctrl elsewhere; "Ctrl" during server rendering and hydration. */
function useModifierLabel() {
  return useSyncExternalStore(subscribeNothing, () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl"), () => "Ctrl");
}

/**
 * The Byline app header (`admin.components.header`): sticky above every admin
 * view, offset by the sidebar's current width so it sits beside it as in
 * shadcn's dashboard shell. Sidebar trigger, where you are, and Search (⌘K).
 *
 * View controls stay with their views: Story publishing is StoryHeader's,
 * Home's contextual "Task" is in My Work. Nothing here duplicates them.
 */
export function BylineAppHeader() {
  const account = useNewsroomAccount();
  if (!account) return null;
  return (
    <AdminRoot className="byline-app-header" toaster={false}>
      <HeaderBar />
    </AdminRoot>
  );
}

function HeaderBar() {
  const pathname = usePathname() ?? "";
  const routes = useNewsroomRoutes();
  const { state, isMobile } = useSidebar();
  const { openSearch } = useBylineSearch();
  const modifier = useModifierLabel();
  const crumbs = locationFor(pathname, routes.admin);

  return (
    <header
      className={cn(
        "flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-sm transition-[margin] duration-200 ease-linear supports-backdrop-filter:bg-background/80 lg:px-4",
        !isMobile && (state === "collapsed" ? "md:ml-(--sidebar-width-icon)" : "md:ml-(--sidebar-width)")
      )}
    >
      <SidebarTrigger className="-ml-1" label="Toggle navigation" title={`Toggle navigation (${modifier}\\)`} aria-keyshortcuts="Control+\ Meta+\" />
      {crumbs.length ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-4 data-vertical:self-auto" />
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              {crumbs.map((crumb, index) => (
                <Fragment key={`${crumb.label}-${index}`}>
                  {index > 0 ? <BreadcrumbSeparator /> : null}
                  <BreadcrumbItem className="min-w-0">
                    {crumb.path !== undefined && index < crumbs.length - 1 ? (
                      <BreadcrumbLink render={<Link href={`${routes.admin}${crumb.path}`} prefetch={false} />}>{crumb.label}</BreadcrumbLink>
                    ) : (
                      <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={openSearch} aria-keyshortcuts="Control+K Meta+K" className="justify-start text-muted-foreground sm:w-56" data-shell-search="">
          <Search data-icon="inline-start" aria-hidden="true" />
          <span className="max-sm:sr-only">Search</span>
          <KbdGroup className="ml-auto max-sm:hidden" aria-hidden="true"><Kbd>{modifier}</Kbd><Kbd>K</Kbd></KbdGroup>
        </Button>
      </div>
    </header>
  );
}
