"use client";

import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { Avatar, AvatarFallback, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { ChevronsUpDown, HeartPulse, LogOut, UserRound, Wrench } from "lucide-react";
import { useState } from "react";
import { ShellLink, useShellNavigation } from "./navigation";

export type ShellUser = { name: string; subtitle: string; avatarUrl: string | null; profileHref?: string | null };

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toLocaleUpperCase();
}

function Identity({ user, compact = false }: { user: ShellUser; compact?: boolean }) {
  const avatar = (
    <Avatar className="size-8 rounded-lg after:rounded-lg">
      {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" className="rounded-lg" /> : null}
      <AvatarFallback className="rounded-lg" aria-hidden="true">{initials(user.name)}</AvatarFallback>
    </Avatar>
  );
  if (compact) return avatar;
  return (
    <>
      {avatar}
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
 * never reads as part of the newsroom's navigation. My profile uses the same
 * guarded navigation as the sidebar. `compact` (the Story workspace's icon
 * rail) shows only the avatar, with the name as its tooltip, whatever state
 * the sidebar around it is in; the menu is the same.
 */
export function NavUser({ user, systemHref, logoutUrl, loginHref, compact = false }: { user: ShellUser; systemHref: string | null; logoutUrl: string; loginHref: string; compact?: boolean }) {
  const account = useNewsroomAccount();
  const { admin } = useNewsroomRoutes();
  const { isMobile, state } = useSidebar();
  const [signingOut, setSigningOut] = useState(false);
  const { runGuarded } = useShellNavigation();

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
          <DropdownMenuTrigger render={<SidebarMenuButton type="button" size="lg" tooltip={compact ? { children: user.name, hidden: false } : state === "collapsed" ? user.name : undefined} aria-label={`Account: ${user.name}`} className={cn("data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground", compact && "md:h-8 md:p-0")} />}>
            <Identity user={user} compact={compact} />
            {compact ? null : <ChevronsUpDown className="ml-auto size-4" aria-hidden="true" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent className="min-w-56" side={isMobile ? "top" : "right"} align="end" sideOffset={4}>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <span className="flex items-center gap-2 px-1 py-1.5 text-left text-sm"><Identity user={user} /></span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {user.profileHref ? <><DropdownMenuItem render={<ShellLink href={user.profileHref} />}><UserRound aria-hidden="true" />My profile</DropdownMenuItem><DropdownMenuSeparator /></> : null}
            {account && account.role !== "staff" ? <DropdownMenuItem render={<ShellLink href={`${admin}/content-health`} />}><HeartPulse aria-hidden="true" />Content Health</DropdownMenuItem> : null}
            {systemHref ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<ShellLink href={`${admin}/site`} />}>Site</DropdownMenuItem>
                  <DropdownMenuItem render={<ShellLink href={systemHref} />}><Wrench aria-hidden="true" />System administration</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={() => runGuarded(() => void signOut())} disabled={signingOut}><LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
