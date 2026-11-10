"use client";

import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { ChoiceCards, type ChoiceCard } from "@byline/newsroom-ui/components/choice-cards";
import { ChevronRight, Trash2 } from "lucide-react";
import { useId, useMemo, type ReactNode } from "react";
import { REVIEW_TARGET_LABELS, REVIEW_TARGETS, type ResolverType, type ReviewTarget, type RoleMatch, type WorkflowStep } from "../../domain/newsroom-roles";
import type { WorkflowsOverview } from "./api";
import { ChoiceCombobox, ChoicesCombobox } from "./pickers";

/**
 * One review step, edited in a right Sheet. Edits go to the workflow's local
 * draft; nothing is saved until the editor saves the workflow, and nothing
 * here decides who a step resolves to: the routing preview asks the server.
 */

const RESOLVERS: ReadonlyArray<ChoiceCard<ResolverType>> = [
  { value: "story-editor", title: "The story’s editor", description: "Whoever is assigned as the story’s editor." },
  { value: "role", title: "A newsroom role", description: "Everyone holding a role this school year; one person is assigned directly, several share a queue." },
  { value: "person", title: "A specific person", description: "Always this person, whatever the story." }
];

const ROLE_MATCH_LABELS: Record<RoleMatch, string> = {
  "story-section": "The member who covers the story’s Section",
  "story-media": "The member who covers the story’s media",
  any: "Anyone in the role"
};

function SwitchField({ label, description, checked, onChange }: { label: string; description?: ReactNode; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description ? <FieldDescription id={`${id}-help`}>{description}</FieldDescription> : null}
      </FieldContent>
      <Switch id={id} checked={checked} aria-describedby={description ? `${id}-help` : undefined} onCheckedChange={(next) => onChange(next === true)} />
    </Field>
  );
}

export function StepSheet({ step, overview, open, onOpenChange, onChange, onRemove, canRemove }: {
  step: WorkflowStep | null;
  overview: WorkflowsOverview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: WorkflowStep) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const ids = { label: useId(), role: useId(), person: useId(), sections: useId(), formats: useId(), media: useId() };
  const roleChoices = useMemo(() => overview.roles.filter((role) => !role.archived || role.id === step?.roleId).map((role) => ({ value: String(role.id), label: role.archived ? `${role.name} (archived)` : role.name, description: role.scopeKind === "none" ? undefined : role.scopeKind === "section" ? "Scoped by Section" : "Scoped by media type" })), [overview.roles, step?.roleId]);
  const people = useMemo(() => overview.people.map((person) => ({ value: String(person.id), label: person.name })), [overview.people]);
  const sections = useMemo(() => overview.sections.map((section) => ({ value: String(section.id), label: section.name })), [overview.sections]);
  const formats = overview.formats.map((format) => ({ value: format.value, label: format.label }));
  const media = overview.mediaTypes.map((type) => ({ value: type.value, label: type.label }));
  if (!step) return null;
  const role = overview.roles.find((entry) => entry.id === step.roleId) ?? null;
  const set = (patch: Partial<WorkflowStep>) => onChange({ ...step, ...patch });
  const setConditions = (patch: Partial<WorkflowStep["conditions"]>) => onChange({ ...step, conditions: { ...step.conditions, ...patch } });
  const advancedCount = step.conditions.sections.length + step.conditions.formats.length + step.conditions.mediaTypes.length + (step.conditions.onlyWithVisuals ? 1 : 0);
  const matchOptions = (["story-section", "story-media", "any"] as const).filter((match) => match === "any" || (match === "story-section" && role?.scopeKind === "section") || (match === "story-media" && role?.scopeKind === "media"));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{step.label || "Review step"}</SheetTitle>
          <SheetDescription>Part of the workflow draft. Save the workflow to apply it to reviews submitted from then on.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={ids.label}>Step name</FieldLabel>
              <Input id={ids.label} value={step.label} maxLength={80} onChange={(event) => set({ label: event.target.value })} />
              <FieldDescription>Reporters see this while their story waits at the step.</FieldDescription>
            </Field>

            <FieldSet>
              <FieldLegend variant="label">What they review</FieldLegend>
              <ChoiceCards value={step.target} onChange={(target: ReviewTarget) => set({ target })} options={REVIEW_TARGETS.map((target) => ({ value: target, title: REVIEW_TARGET_LABELS[target] }))} label="What they review" className="grid-cols-3" />
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Who reviews</FieldLegend>
              <ChoiceCards value={step.resolver} onChange={(resolver) => set({ resolver })} options={RESOLVERS} label="Who reviews" />
            </FieldSet>

            {step.resolver === "role" ? (
              <>
                <Field data-invalid={step.roleId === null ? true : undefined}>
                  <FieldLabel htmlFor={ids.role}>Role</FieldLabel>
                  <ChoiceCombobox id={ids.role} choices={roleChoices} value={step.roleId === null ? null : String(step.roleId)} onChange={(next) => {
                    const chosen = overview.roles.find((entry) => String(entry.id) === next);
                    // A match only makes sense for the kind of scope the role has.
                    const match: RoleMatch = chosen?.scopeKind === "section" ? "story-section" : chosen?.scopeKind === "media" ? "story-media" : "any";
                    set({ roleId: next === null ? null : Number(next), roleMatch: match });
                  }} placeholder="Search roles…" invalid={step.roleId === null} />
                  {step.roleId === null ? <FieldDescription>Choose the role this step routes to.</FieldDescription> : null}
                </Field>
                {role ? (
                  <FieldSet>
                    <FieldLegend variant="label">Which members</FieldLegend>
                    {role.scopeKind === "none"
                      ? <FieldDescription>{role.name} isn’t scoped, so everyone who holds it is eligible.</FieldDescription>
                      : <>
                        <ChoiceCards value={step.roleMatch} onChange={(roleMatch) => set({ roleMatch })} options={matchOptions.map((match) => ({ value: match, title: ROLE_MATCH_LABELS[match] }))} label="Which members" />
                        <FieldDescription>Members who cover everything else are used when nobody covers the story’s {role.scopeKind === "section" ? "Section" : "media"}.</FieldDescription>
                      </>}
                  </FieldSet>
                ) : null}
              </>
            ) : null}

            {step.resolver === "person" ? (
              <Field data-invalid={step.userId === null ? true : undefined}>
                <FieldLabel htmlFor={ids.person}>Person</FieldLabel>
                <ChoiceCombobox id={ids.person} choices={people} value={step.userId === null ? null : String(step.userId)} onChange={(next) => set({ userId: next === null ? null : Number(next) })} placeholder="Search people…" invalid={step.userId === null} />
              </Field>
            ) : null}

            <FieldSeparator />

            <FieldSet>
              <FieldLegend variant="label">If nobody is eligible</FieldLegend>
              <FieldGroup className="gap-4">
                <SwitchField label="Send it to the editors’ queue" description="Instead of keeping the story out of review." checked={step.fallback === "editors"} onChange={(on) => set({ fallback: on ? "editors" : "none" })} />
                <SwitchField label="Let writers review their own story" description="At this step only." checked={step.selfReview === "allow"} onChange={(on) => set({ selfReview: on ? "allow" : "exclude-writers" })} />
              </FieldGroup>
              <FieldDescription>With both off, a step with nobody eligible keeps the story out of review and tells the editors why.</FieldDescription>
            </FieldSet>

            <FieldSeparator />

            <Collapsible defaultOpen={advancedCount > 0}>
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 group/advanced" />}>
                <ChevronRight data-icon="inline-start" aria-hidden="true" className="transition-transform group-data-[panel-open]/advanced:rotate-90" />
                Only for some stories
                {advancedCount ? <Badge variant="secondary">{advancedCount}</Badge> : null}
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 pt-3">
                <FieldDescription>Leave these empty and the step applies to every story. A step that doesn’t apply is skipped and shown as skipped.</FieldDescription>
                <Field><FieldLabel htmlFor={ids.sections}>Sections</FieldLabel><ChoicesCombobox id={ids.sections} choices={sections} value={step.conditions.sections.map(String)} onChange={(next) => setConditions({ sections: next.map(Number) })} placeholder="Any Section" /></Field>
                <Field><FieldLabel htmlFor={ids.formats}>Story formats</FieldLabel><ChoicesCombobox id={ids.formats} choices={formats} value={step.conditions.formats} onChange={(next) => setConditions({ formats: next })} placeholder="Any format" /></Field>
                <Field><FieldLabel htmlFor={ids.media}>Media types</FieldLabel><ChoicesCombobox id={ids.media} choices={media} value={step.conditions.mediaTypes} onChange={(next) => setConditions({ mediaTypes: next })} placeholder="Any media" /></Field>
                <SwitchField label="Only stories with visuals" checked={step.conditions.onlyWithVisuals} onChange={(on) => setConditions({ onlyWithVisuals: on })} />
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </div>
        <SheetFooter className="flex-row items-center justify-between border-t">
          <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={onRemove} disabled={!canRemove} title={canRemove ? undefined : "A workflow needs at least one step"}><Trash2 data-icon="inline-start" aria-hidden="true" />Remove step</Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
