"use client";

import { QuickCreateRelation } from "./QuickCreateRelation";
import { relationIdOf, relationIdsOf, useStoryField } from "./form";
import { MultiPicker, SinglePicker, useOptions } from "./RelationPickers";
import type { StoryScreenContext } from "./StoryScreen";
import type { Id } from "./types";

/** The public byline and section live in Payload's Story form, including when edited from Plan. */
export function StoryBylineField({ context, label = "Byline" }: { context: StoryScreenContext; label?: string }) {
  const contributors = useStoryField<Id[]>("contributors");
  const people = useOptions(context.api, "people", "name");
  return <MultiPicker
    label={label}
    placeholder="Add contributors"
    options={people}
    value={relationIdsOf(contributors.value)}
    onChange={(ids) => contributors.setValue(ids)}
    disabled={context.readOnly}
    footer={!context.readOnly && (context.role === "editor" || context.role === "administrator")
      ? <QuickCreateRelation context={context} kind="guest" onCreated={(id) => contributors.setValue([...relationIdsOf(contributors.value), id])} />
      : null}
  />;
}

export function StorySectionField({ context }: { context: StoryScreenContext }) {
  const section = useStoryField<Id | null>("section");
  const sections = useOptions(context.api, "sections", "name");
  return <SinglePicker label="Section" placeholder="No section" options={sections} value={relationIdOf(section.value)} onChange={(id) => section.setValue(id)} disabled={context.readOnly} />;
}
