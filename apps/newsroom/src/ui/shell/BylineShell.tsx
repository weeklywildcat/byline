"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { SidebarProvider } from "@byline/newsroom-ui/ui/sidebar";
import { createAdminQueryClient } from "@byline/newsroom-screens/story/story-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type CSSProperties, type ReactNode } from "react";
import { useNewsroomAccount } from "./account";
import { BylineCreateProvider } from "./create";
import { BylineSearchProvider } from "./search";
import { SIDEBAR_COOKIE, SIDEBAR_SHORTCUT } from "./shell-config";

/**
 * The Byline application shell's state, above every admin view: one query
 * cache for all Byline screens, the shadcn Sidebar state (shared by the Nav,
 * the app header and any screen that needs it), the Create controller, the
 * command palette and the newsroom's one toaster (screens inside the shell
 * render none of their own, so a toast never appears twice).
 *
 * It adds no layout of its own: Payload's template still places the Nav and
 * the view, so Payload's document, form and lock infrastructure is untouched.
 * The Sidebar wrapper is `display: contents` for that reason; it exists only
 * so the shell's CSS variables and `group/sidebar-wrapper` reach both.
 */
// The Sidebar's width variables are inline styles, which the newsroom's rem→px
// compile never sees, and Payload's root font is not 16px: give them in px.
const SHELL_STYLE = { display: "contents", "--sidebar-width": "256px", "--sidebar-width-icon": "48px", "--sidebar-width-mobile": "288px" } as CSSProperties;

export function BylineShell({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  const [client] = useState(createAdminQueryClient);
  const account = useNewsroomAccount();
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider defaultOpen={defaultOpen} keyboardShortcut={SIDEBAR_SHORTCUT} persistCookie={SIDEBAR_COOKIE} style={SHELL_STYLE}>
        <BylineCreateProvider>
          <BylineSearchProvider>{children}</BylineSearchProvider>
        </BylineCreateProvider>
        {account ? <AdminRoot className="byline-shell-toaster">{null}</AdminRoot> : null}
      </SidebarProvider>
    </QueryClientProvider>
  );
}
