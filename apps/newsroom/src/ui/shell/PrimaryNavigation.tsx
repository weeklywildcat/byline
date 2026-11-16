"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import { primaryNavigationFor, type primaryLocationFor } from "../../domain/navigation";
import { NAV_ICONS } from "./nav-items";
import { MoreNavigation, type MoreAccount } from "./MoreNavigation";
import { ShellLink } from "./navigation";
import { tourAnchor } from "../onboarding/tour-targets";

export function PrimaryNavigation({ admin, role, active, ...account }: MoreAccount & {
  active: NonNullable<ReturnType<typeof primaryLocationFor>>["key"];
}) {
  return (
    <nav aria-label="Primary navigation" className="byline-primary-navigation border-border bg-background/95 supports-backdrop-filter:bg-background/90">
      {primaryNavigationFor(role).map(({ key, label, path }) => {
        const Icon = NAV_ICONS[key]!;
        return (
          <ShellLink
            key={key}
            href={`${admin}${path}` || "/"}
            aria-current={active === key ? "page" : undefined}
            {...tourAnchor(`nav-${key}`)}
            className={cn("byline-primary-link text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring", key === "media" && "byline-tablet-media")}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {label}
          </ShellLink>
        );
      })}
      <MoreNavigation admin={admin} role={role} {...account} />
    </nav>
  );
}
