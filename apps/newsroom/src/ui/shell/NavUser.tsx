"use client";

import { useNewsroomAccount, useNewsroomRoutes } from "./account";
import { Avatar, AvatarFallback, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { ChevronsUpDown, Keyboard, LogOut, NotebookPen, UserRound, Wrench } from "lucide-react";
import { ShellLink } from "./navigation";
import { useSignOut } from "./sign-out";
import { useBylineShortcuts } from "./shortcuts";

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
  const { signingOut, signOut } = useSignOut(logoutUrl, loginHref);
  const { openHelp } = useBylineShortcuts();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SidebarMenuButton type="button" size="lg" tooltip={compact ? { children: user.name, hidden: false } : state === "collapsed" ? user.name : undefined} aria-label={`Account: ${user.name}`} className={cn("data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground", compact && "md:h-8 md:p-0 any-pointer-coarse:justify-center")} />}>
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
            {user.profileHref ? <DropdownMenuItem render={<ShellLink href={user.profileHref} />}><UserRound aria-hidden="true" />My profile</DropdownMenuItem> : null}
            {/* Field Mode: the reporter's phone-first capture screen (its own shell, docs/field-mode.md). */}
            <DropdownMenuItem render={<ShellLink href={`${admin}/field`} />}><NotebookPen aria-hidden="true" />Field Mode</DropdownMenuItem>
            <DropdownMenuItem onClick={openHelp}><Keyboard aria-hidden="true" />Keyboard shortcuts<DropdownMenuShortcut>?</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuSeparator />
            {systemHref ? (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuItem render={<ShellLink href={`${admin}/site`} />}>Site</DropdownMenuItem>
                  <DropdownMenuItem render={<ShellLink href={systemHref} />}><Wrench aria-hidden="true" />System administration</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={signOut} disabled={signingOut}><LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
