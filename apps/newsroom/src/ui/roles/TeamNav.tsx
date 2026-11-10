"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { REVIEW_WORKFLOWS_PATH } from "../../domain/navigation";
import { useNewsroomRoutes } from "../shell/account";
import { ShellLink } from "../shell/navigation";

export type TeamView = "people" | "roles" | "workflows" | "workload";

const LINKS: Array<{ view: TeamView; label: string; path: string }> = [
  { view: "people", label: "People", path: "/people" },
  { view: "roles", label: "Roles", path: "/people?view=roles" },
  { view: "workflows", label: "Review workflows", path: REVIEW_WORKFLOWS_PATH },
  { view: "workload", label: "Workload", path: "/people?view=workload" }
];

/** The team's operational screens. Links, not tabs: each is its own place with its own URL. */
export function TeamNav({ current }: { current: TeamView }) {
  const { admin } = useNewsroomRoutes();
  return (
    <ButtonGroup aria-label="Team and review routing" className="flex-wrap">
      {LINKS.map((link) => (
        <Button key={link.view} type="button" size="sm" variant={link.view === current ? "secondary" : "outline"} nativeButton={false} role="link" render={<ShellLink href={`${admin}${link.path}`} aria-current={link.view === current ? "page" : undefined} />}>
          {link.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}
