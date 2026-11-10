"use client";

import { primaryNavigationFor, type primaryLocationFor } from "../../domain/navigation";
import type { Role } from "../../domain/vocabulary";
import { NAV_ICONS } from "./nav-items";
import { ShellLink } from "./navigation";

export function PrimaryNavigation({ admin, role, active }: {
  admin: string;
  role: Role;
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
            className="byline-primary-link text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:font-semibold aria-[current=page]:text-primary focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring"
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {label}
          </ShellLink>
        );
      })}
    </nav>
  );
}
