"use client";

import { storiesHref } from "@byline/newsroom-screens/planning/planning-api";
import { builtInStoryView } from "@byline/newsroom-screens/planning/story-views";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Kbd } from "@byline/newsroom-ui/ui/kbd";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { BookmarkCheck, ChevronRight, Keyboard, LogOut, NotebookPen, Settings, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { canAdministerSystem, navigationFor, STORIES_PATH, SYSTEM_ADMINISTRATION_PATH, type NavItem } from "../../domain/navigation";
import type { MoreAccount } from "./MoreNavigation";
import { NAV_ICONS } from "./nav-items";
import { opensElsewhere, ShellLink, useShellNavigation } from "./navigation";
import { useBylineShortcuts } from "./shortcuts";
import { useSignOut } from "./sign-out";

function MoreGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="px-3 pb-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <Separator className="mb-1" />
      {children}
    </section>
  );
}

function MoreLink({ href, label, icon: Icon, follow }: { href: string; label: string; icon: LucideIcon; follow: (event: MouseEvent<HTMLAnchorElement>, href: string) => void }) {
  return (
    <Item render={<ShellLink href={href} onClick={(event) => follow(event, href)} />} size="sm" className="min-h-11 flex-nowrap hover:bg-muted">
      <ItemMedia><Icon aria-hidden="true" /></ItemMedia>
      <ItemContent><ItemTitle>{label}</ItemTitle></ItemContent>
      <ItemActions><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
    </Item>
  );
}

export function MorePanel({ admin, role, hasProfile, loginHref, logoutUrl, afterClose }: MoreAccount & { afterClose: (action: () => void) => void }) {
  const { navigate } = useShellNavigation();
  const { openHelp } = useBylineShortcuts();
  const { signOut, signingOut } = useSignOut(logoutUrl, loginHref);
  const items = navigationFor(role);
  const team = items.find((item) => item.key === "people");
  const review = builtInStoryView("review");
  const publishing = items.filter((item) => item.group === "publish");
  const canAdminister = canAdministerSystem(role);
  function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || opensElsewhere(event)) return;
    event.preventDefault();
    afterClose(() => navigate(href));
  }
  const link = (item: NavItem) => <MoreLink key={item.key} href={`${admin}${item.path}`} label={item.label} icon={NAV_ICONS[item.key]!} follow={follow} />;

  return (
    <div className="grid gap-4 px-2 pb-2">
      <MoreGroup title="Workspaces">
        <MoreLink href={`${admin}/field`} label="Field Mode" icon={NotebookPen} follow={follow} />
        {items.filter((item) => item.key === "media" || item.key === "collections").map(link)}
      </MoreGroup>
      {team && (
        <MoreGroup title="Team">
          {link(team)}
          {review && <MoreLink href={storiesHref(`${admin}${STORIES_PATH}`, review.filters)} label={review.label} icon={BookmarkCheck} follow={follow} />}
        </MoreGroup>
      )}
      {publishing.length > 0 && (
        <MoreGroup title="Publishing">
          {publishing.map(link)}
          {canAdminister && <MoreLink href={`${admin}/site`} label="Site" icon={Settings} follow={follow} />}
        </MoreGroup>
      )}
      <MoreGroup title="Account and tools">
        {hasProfile && <MoreLink href={`${admin}/profile`} label="My profile" icon={UserRound} follow={follow} />}
        <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2.5 px-3" aria-keyshortcuts="?" onClick={() => afterClose(openHelp)}>
          <Keyboard aria-hidden="true" />Keyboard shortcuts <Kbd className="ml-auto" aria-hidden="true">?</Kbd>
        </Button>
        {canAdminister && <MoreLink href={`${admin}${SYSTEM_ADMINISTRATION_PATH}`} label="System administration" icon={Wrench} follow={follow} />}
        <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2.5 px-3" disabled={signingOut} onClick={() => afterClose(signOut)}>
          <LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </MoreGroup>
    </div>
  );
}
