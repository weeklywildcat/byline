import type { ReactNode } from "react";

/** A group heading inside a section: a label on the left, the group's action on the right. */
export function SubHeading({ id, title, children }: { id?: string; title: string; children?: ReactNode }) {
  return <div className="mb-1 flex min-h-7 items-center justify-between gap-2">
    <h3 id={id} className="text-sm font-medium">{title}</h3>
    {children}
  </div>;
}
