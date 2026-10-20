import { useId, type ReactNode } from "react";

/** A story's facts as a definition list: plain text for read-only values, restrained triggers for editable ones. */
export function PropertyList({ children }: { children: ReactNode }) {
  return <div className="@container"><dl className="flex flex-col gap-1.5 text-sm">{children}</dl></div>;
}

export function Property({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div role="group" aria-labelledby={id} className="grid min-h-8 items-center gap-x-3 @xs:grid-cols-[7.5rem_minmax(0,1fr)]">
    <dt id={id} className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
  </div>;
}
