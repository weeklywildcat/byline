"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { House, LogOut, Plus, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavLink = { key: string; label: string; href: string };

const ICONS: Record<string, typeof House> = { home: House };

function isActive(pathname: string, href: string, home: string) {
  if (href === home) return pathname === home || pathname === `${home}/`;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BylineSidebar({ items, administration, newStoryHref, homeHref, userName, logoutUrl, loginHref }: {
  items: NavLink[];
  administration: NavLink[];
  newStoryHref: string;
  homeHref: string;
  userName: string;
  logoutUrl: string;
  loginHref: string;
}) {
  const pathname = usePathname() ?? "";
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch(logoutUrl, { method: "POST", credentials: "include" });
    } finally {
      window.location.assign(loginHref);
    }
  }

  const linkClass = (active: boolean) => cn(buttonVariants({ variant: "ghost", size: "sm" }), "w-full justify-start gap-2 font-normal", active && "bg-muted font-medium");

  return (
    <AdminRoot className="byline-shell-nav" toaster={false}>
      <nav aria-label="Byline" className="flex h-full flex-col gap-3 border-r border-border bg-sidebar px-3 py-4 text-sidebar-foreground">
        <Link href={homeHref} className="px-2 text-base font-semibold tracking-tight" prefetch={false}>
          Byline
        </Link>
        <Link href={newStoryHref} className={cn(buttonVariants({ size: "sm" }), "w-full justify-start gap-2")} prefetch={false}>
          <Plus aria-hidden="true" />
          New story
        </Link>
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const Icon = ICONS[item.key];
            const active = isActive(pathname, item.href, homeHref);
            return (
              <li key={item.key}>
                <Link href={item.href} className={linkClass(active)} aria-current={active ? "page" : undefined} prefetch={false}>
                  {Icon ? <Icon aria-hidden="true" /> : null}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        {administration.length > 0 ? (
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-2 text-xs font-medium text-muted-foreground">
              <Wrench className="size-3.5" aria-hidden="true" />
              Administration
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {administration.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className={cn(linkClass(isActive(pathname, item.href, homeHref)), "text-muted-foreground")} prefetch={false}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-auto flex flex-col gap-2">
          <Separator />
          <div className="flex items-center justify-between gap-2 px-2">
            <span className="truncate text-sm" title={userName}>{userName}</span>
            <Button variant="ghost" size="icon-sm" onClick={signOut} disabled={signingOut} aria-label="Sign out">
              <LogOut aria-hidden="true" />
            </Button>
          </div>
        </div>
      </nav>
    </AdminRoot>
  );
}
