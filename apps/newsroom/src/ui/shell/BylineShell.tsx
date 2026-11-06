"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { SidebarProvider } from "@byline/newsroom-ui/ui/sidebar";
import { createAdminQueryClient } from "@byline/newsroom-screens/story/story-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { BylineCreateProvider } from "./create";
import { ShellLayoutProvider, shellSidebarStyle, SidebarWidthSyncProvider, useCurrentShellLayout, useSidebarWidthLayout } from "./layout";
import { ShellNavigationProvider } from "./navigation";
import { BylineSearchProvider } from "./search";
import { StorySwitcherProvider } from "./StorySwitcher";
import { SIDEBAR_COOKIE, SIDEBAR_SHORTCUT } from "./shell-config";

/**
 * The Byline application shell's state, above every admin view: one query
 * cache for all Byline screens, the one shadcn Sidebar state (shared by the
 * Nav, the app header and any screen that needs it), guarded navigation, the
 * Create controller, the command palette, the Story switcher and the
 * newsroom's one toaster (screens inside the shell render none of their own,
 * so a toast never appears twice).
 *
 * It adds no layout of its own: Payload's template still places the Nav and
 * the view, so Payload's document, form and lock infrastructure is untouched.
 * The Sidebar wrapper is `display: contents` for that reason; it exists only
 * so the shell's CSS variables and `group/sidebar-wrapper` reach both. Those
 * variables follow the layout: the Story workspace reserves sidebar-09's
 * 350px, everything else the ordinary 256px (shell-config.ts), applied once
 * the sidebar for the new screen has mounted so the change animates.
 */
export function BylineShell({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  const [client] = useState(createAdminQueryClient);
  const account = useNewsroomAccount();
  const routes = useNewsroomRoutes();
  const layout = useCurrentShellLayout(routes.admin);
  const width = useSidebarWidthLayout(layout);
  const style = useMemo(() => shellSidebarStyle(width.applied), [width.applied]);
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider defaultOpen={defaultOpen} keyboardShortcut={SIDEBAR_SHORTCUT} persistCookie={SIDEBAR_COOKIE} style={style}>
        <ShellLayoutProvider value={layout}>
          <SidebarWidthSyncProvider value={width.sync}>
            <ShellNavigationProvider>
              <BylineCreateProvider>
                <BylineSearchProvider>
                  <StorySwitcherProvider>{children}</StorySwitcherProvider>
                </BylineSearchProvider>
              </BylineCreateProvider>
            </ShellNavigationProvider>
          </SidebarWidthSyncProvider>
        </ShellLayoutProvider>
        {account ? <AdminRoot className="byline-shell-toaster">{null}</AdminRoot> : null}
      </SidebarProvider>
    </QueryClientProvider>
  );
}
