import type { ReactNode } from "react";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { cn } from "../lib/utils";

/** shadcn Empty at newsroom density: no illustration, a hairline instead of a big dashed box. */
export function EmptyState({ title, description, children, className }: { title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string }) {
  return <Empty className={cn("gap-3 border p-4", className)}>
    <EmptyHeader className="gap-0.5">
      <EmptyTitle className="text-sm">{title}</EmptyTitle>
      {description ? <EmptyDescription className="text-sm">{description}</EmptyDescription> : null}
    </EmptyHeader>
    {children ? <EmptyContent>{children}</EmptyContent> : null}
  </Empty>;
}
