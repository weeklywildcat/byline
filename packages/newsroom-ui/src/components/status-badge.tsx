import type { ComponentProps } from "react";
import { Badge } from "../ui/badge";
import { cn } from "../lib/utils";

/** Three looks only: plain, finished, and the one warning for work that needs a person. */
export type StatusTone = "neutral" | "done" | "attention";

const variants: Record<StatusTone, ComponentProps<typeof Badge>["variant"]> = { neutral: "outline", done: "secondary", attention: "outline" };

export function StatusBadge({ tone = "neutral", className, ...props }: { tone?: StatusTone } & Omit<ComponentProps<typeof Badge>, "variant">) {
  return <Badge variant={variants[tone]} className={cn(tone === "attention" && "border-warning/30 bg-warning/10 text-warning", className)} {...props} />;
}
