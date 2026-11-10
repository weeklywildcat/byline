"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Kbd } from "@byline/newsroom-ui/ui/kbd";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { BookmarkCheck, ChevronRight, Keyboard, LogOut, Settings, Smartphone, UserRound, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { REVIEW_WORKFLOWS_PATH, SYSTEM_ADMINISTRATION_PATH, type NavItem } from "../../domain/navigation";
import { NAV_ICONS } from "./nav-items";
import { ShellLink } from "./navigation";
import { useBylineShortcuts } from "./shortcuts";
import { useSignOut } from "./sign-out";

function MoreGroup({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="px-3 pb-1 text-sm font-semibold text-muted-foreground">{title}</h2>
      <Separator className="mb-1" />
      {children}
    </section>
  );
}

function MoreLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  return (
    <Item render={<ShellLink href={href} />} size="sm" className="min-h-11 flex-nowrap hover:bg-muted">
      <ItemMedia><Icon aria-hidden="true" /></ItemMedia>
      <ItemContent><ItemTitle>{label}</ItemTitle></ItemContent>
      <ItemActions><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
    </Item>
  );
}

export function MoreScreen({ items, adminRoute, hasProfile, canAdminister, loginHref, logoutUrl }: {
  items: NavItem[];
  adminRoute: string;
  hasProfile: boolean;
  canAdminister: boolean;
  loginHref: string;
  logoutUrl: string;
}) {
  const { openHelp } = useBylineShortcuts();
  const { signOut, signingOut } = useSignOut(logoutUrl, loginHref);
  const team = items.find((item) => item.key === "people");
  const publishing = items.filter((item) => item.group === "publish");
  const link = (item: NavItem) => <MoreLink key={item.key} href={`${adminRoute}${item.path}`} label={item.label} icon={NAV_ICONS[item.key]!} />;

  return (
    <AdminRoot toaster={false}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
        <h1 className="px-3 text-2xl font-semibold tracking-tight">More</h1>
        <MoreGroup id="more-workspaces" title="Workspaces">
          {items.filter((item) => item.key === "media" || item.key === "collections").map(link)}
        </MoreGroup>
        {team && (
          <MoreGroup id="more-team" title="Team">
            {link(team)}
            <MoreLink href={`${adminRoute}${REVIEW_WORKFLOWS_PATH}`} label="Review workflows" icon={BookmarkCheck} />
          </MoreGroup>
        )}
        {publishing.length > 0 && (
          <MoreGroup id="more-publishing" title="Publishing">
            {publishing.map(link)}
          </MoreGroup>
        )}
        <MoreGroup id="more-account" title="Account and tools">
          <MoreLink href={`${adminRoute}/field`} label="Field Mode" icon={Smartphone} />
          {hasProfile && <MoreLink href={`${adminRoute}/profile`} label="My profile" icon={UserRound} />}
          <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2.5 px-3" aria-keyshortcuts="?" onClick={openHelp}>
            <Keyboard aria-hidden="true" />Keyboard shortcuts <Kbd className="ml-auto" aria-hidden="true">?</Kbd>
          </Button>
          {canAdminister && <>
            <MoreLink href={`${adminRoute}/site`} label="Site" icon={Settings} />
            <MoreLink href={`${adminRoute}${SYSTEM_ADMINISTRATION_PATH}`} label="System administration" icon={Wrench} />
          </>}
          <Button type="button" variant="ghost" className="h-11 w-full justify-start gap-2.5 px-3" disabled={signingOut} onClick={signOut}>
            <LogOut aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </MoreGroup>
      </div>
    </AdminRoot>
  );
}
