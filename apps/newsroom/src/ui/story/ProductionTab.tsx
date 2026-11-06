"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useCallback, useEffect, useState } from "react";
import { getJson, query, type Paginated } from "./api";
import { formatDay, labelFor, SectionHeading } from "./parts";
import type { StoryScreenContext } from "./StoryScreen";
import type { WorkRecord } from "./types";

type Section = { key: "production-assignments" | "tasks" | "sources" | "appointments"; title: string; empty: string };

const SECTIONS: Section[] = [
  { key: "production-assignments", title: "Production", empty: "No photo, graphic, video or audio assignments." },
  { key: "tasks", title: "Tasks", empty: "No tasks." },
  { key: "sources", title: "Sources", empty: "No reporting sources yet." },
  { key: "appointments", title: "Interviews and appointments", empty: "Nothing scheduled." }
];

function when(record: WorkRecord, timeZone: string) {
  if (record.scheduleMode === "exact" && record.startAt) return formatDay(record.startAt, timeZone);
  if (record.scheduleMode === "window" && record.windowStart) return `${formatDay(record.windowStart, timeZone)}${record.windowEnd ? ` – ${formatDay(record.windowEnd, timeZone)}` : ""}`;
  if (record.scheduleMode === "unscheduled") return "Needs scheduling";
  const due = record.deadline ?? record.due;
  return due ? `Due ${formatDay(due, timeZone)}` : "";
}

/**
 * Production and reporting work on this story. Each list is read with the
 * signed-in user's access, so a participant sees only the work assigned to them.
 * Editing these records arrives with the ported Story Workspace sections.
 */
export function ProductionTab({ context }: { context: StoryScreenContext }) {
  const [records, setRecords] = useState<Partial<Record<Section["key"], WorkRecord[]>>>({});
  const [failed, setFailed] = useState<Section["key"][]>([]);
  const load = useCallback(async () => {
    if (context.storyId === undefined) return;
    const results = await Promise.allSettled(SECTIONS.map((section) => getJson<Paginated<WorkRecord>>(context.api, `/${section.key}${query({ "where[story][equals]": String(context.storyId), depth: 1, limit: 100 })}`)));
    const next: Partial<Record<Section["key"], WorkRecord[]>> = {};
    const errors: Section["key"][] = [];
    results.forEach((result, index) => {
      const key = SECTIONS[index].key;
      if (result.status === "fulfilled") next[key] = result.value.docs;
      else errors.push(key);
    });
    setRecords(next);
    setFailed(errors);
  }, [context.api, context.storyId]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      {SECTIONS.map((section) => (
        <section key={section.key} aria-label={section.title} className="flex flex-col gap-2">
          <SectionHeading>{section.title}</SectionHeading>
          {failed.includes(section.key) ? (
            <InlineAlert title={`${section.title} could not be loaded.`} onAction={() => void load()} />
          ) : (records[section.key] ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{records[section.key] ? section.empty : "Loading…"}</p>
          ) : (
            <ItemGroup>
              {(records[section.key] ?? []).map((record) => {
                const people = (record.assignees ?? []).map((person) => (typeof person === "object" ? person.name : null)).filter(Boolean).join(", ");
                const detail = [labelFor(record.type ?? record.kind), when(record, context.timeZone), people].filter(Boolean).join(" · ");
                return (
                  <Item key={String(record.id)} size="sm" variant="outline">
                    <ItemContent>
                      <ItemTitle>{record.title ?? record.label}</ItemTitle>
                      {detail ? <ItemDescription>{detail}</ItemDescription> : null}
                    </ItemContent>
                    <Badge variant="secondary">{labelFor(record.status ?? record.state)}</Badge>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </section>
      ))}
    </div>
  );
}
