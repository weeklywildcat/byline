"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { ChevronsUpDown, LogOut, Wrench } from "lucide-react";
import { useState } from "react";

export type ShellUser = { name: string; subtitle: string; avatarUrl: string | null };

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

function Identity({ user }: { user: ShellUser }) {
  return (
    <>
      <Avatar className="size-8 rounded-lg after:rounded-lg">
        {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" className="rounded-lg" /> : null}
        <AvatarFallback className="rounded-lg" aria-hidden="true">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{user.subtitle}</span>
      </span>
    </>
  );
}

/**
 * The account menu in the sidebar footer. System administration (the raw
 * Payload maintenance screens) lives here, for administrators only, so it
 * never reads as part of the newsroom's navigation. Profile and Preferences
 * join once their Byline screens exist.
 */
export function NavUser({ user, systemHref, logoutUrl, loginHref }: { user: ShellUser; systemHref: string | null; logoutUrl: string; loginHref: string }) {
  const { isMobile, state } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" });
    } finally {
      window.location.assign(loginHref);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton type="button" size="lg" tooltip={state === "collapsed" ? user.name : undefined} aria-label={`Account: ${user.name}`} className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground" />}>
            <Identity user={user} />
            <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "top" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <span className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"><Identity user={user} /></span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {systemHref ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<a href={systemHref} />}><Wrench aria-hidden="true" />System administration</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={() => void signOut()} disabled={signingOut}><LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
