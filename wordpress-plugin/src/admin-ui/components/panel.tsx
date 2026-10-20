import { useId, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

/** A titled Card section: one landmark with a heading, an optional action, and content. */
export function Panel({ id: given, title, description, action, children, className, contentClassName }: { id?: string; title: ReactNode; description?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; contentClassName?: string }) {
  const generated = useId();
  const id = given ?? generated;
  return <section aria-labelledby={id} className={cn("min-w-0", className)}>
    <Card size="sm">
      <CardHeader>
        <CardTitle id={id} role="heading" aria-level={2}>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent className={contentClassName}>{children}</CardContent> : null}
    </Card>
  </section>;
}
