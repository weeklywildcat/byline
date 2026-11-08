"use client";

import { Field, FieldContent, FieldTitle } from "@byline/newsroom-ui/ui/field";
import type { ReactNode } from "react";

/** A quiet property row: stable label column on the left, value/control on the right. */
export function Property({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <Field orientation="responsive" className="min-h-8 py-0.5 @md/field-group:items-center!">
      <FieldTitle className="font-normal text-muted-foreground @md/field-group:w-28 @md/field-group:flex-none!">
        {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : label}
      </FieldTitle>
      <FieldContent className="min-w-0 text-sm [overflow-wrap:anywhere]">{children}</FieldContent>
    </Field>
  );
}

export function SectionHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-medium">{children}</h2>
      {action}
    </div>
  );
}

/** Date-only values are calendar days; instants are read in the newsroom timezone, never the browser's. */
export function formatDay(value: string | null | undefined, timeZone: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
  }
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(value));
}

export function labelFor(value: string | undefined | null): string {
  if (!value) return "";
  return value.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());
}
