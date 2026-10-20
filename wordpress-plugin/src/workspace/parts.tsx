/** The few Byline-specific pieces the workspace sections share. Everything visual is shadcn Nova. */
import type { ComponentProps, ReactNode } from "react";
import { Plus } from "lucide-react";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";

export function AddButton({ children, ...props }: { children: ReactNode } & Omit<ComponentProps<typeof Button>, "children">) {
  return <Button type="button" variant="outline" size="sm" {...props}><Plus data-icon="inline-start" aria-hidden="true" />{children}</Button>;
}

/** Inline metadata joined by middots; flagged parts carry the one warning colour. */
export function Meta({ parts, flag }: { parts: Array<string | false | null | undefined>; flag?: (index: number) => boolean }) {
  const shown = parts.filter((part): part is string => Boolean(part));
  if (!shown.length) return null;
  return <>{shown.map((part, index) => <span key={index}>{index > 0 ? " · " : ""}<span className={flag?.(index) ? "text-warning" : undefined}>{part}</span></span>)}</>;
}

/** A section that failed to load on the server; the rest of the page still works. */
export function SectionFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return <InlineAlert onAction={onRetry}>Couldn't load {what}.</InlineAlert>;
}
