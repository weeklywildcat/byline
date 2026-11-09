"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { RadioGroup, RadioGroupItem } from "@byline/newsroom-ui/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { ChevronDown } from "lucide-react";
import { useId, useMemo } from "react";
import { REVIEW_TARGET_LABELS, REVIEW_TARGETS, type ResolverType, type ReviewTarget, type RoleMatch, type WorkflowStep } from "../../domain/newsroom-roles";
import type { WorkflowsOverview } from "./api";
import { ChoiceCombobox, ChoicesCombobox } from "./pickers";

/**
 * One review step, edited in a right Sheet. Edits go to the workflow's local
 * draft; nothing is saved until the editor saves the workflow, and nothing
 * here decides who a step resolves to: the routing preview asks the server.
 */

const RESOLVER_LABELS: Record<ResolverType, { label: string; help: string }> = {
  "story-editor": { label: "The story’s editor", help: "Whoever is assigned as the story’s editor." },
  role: { label: "A newsroom role", help: "Everyone holding a role this school year; one person is assigned directly, several share a queue." },
  person: { label: "A specific person", help: "Always this person, whatever the story." }
};

const ROLE_MATCH_LABELS: Record<RoleMatch, string> = {
  "story-section": "The member who covers the story’s Section",
  "story-media": "The member who covers the story’s media",
  any: "Anyone in the role"
};

export function StepSheet({ step, overview, open, onOpenChange, onChange, onRemove, canRemove }: {
  step: WorkflowStep | null;
  overview: WorkflowsOverview;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (next: WorkflowStep) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const ids = { label: useId(), target: useId(), resolver: useId(), role: useId(), person: useId(), match: useId(), sections: useId(), formats: useId(), media: useId(), visuals: useId(), self: useId(), fallback: useId() };
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
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{step.label || "Review step"}</SheetTitle>
          <SheetDescription>These changes are part of the workflow draft. Save the workflow to apply them to reviews submitted from then on.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={ids.label}>Step name</FieldLabel>
              <Input id={ids.label} value={step.label} maxLength={80} onChange={(event) => set({ label: event.target.value })} />
              <FieldDescription>Reporters see this while their story waits at the step.</FieldDescription>
            </Field>

            <FieldSet>
              <FieldLegend variant="label">What they review</FieldLegend>
              <RadioGroup value={step.target} onValueChange={(next) => set({ target: next as ReviewTarget })} aria-label="What they review">
                {REVIEW_TARGETS.map((target) => (
                  <Field key={target} orientation="horizontal"><RadioGroupItem value={target} id={`${ids.target}-${target}`} /><FieldLabel htmlFor={`${ids.target}-${target}`} className="font-normal">{REVIEW_TARGET_LABELS[target]}</FieldLabel></Field>
                ))}
              </RadioGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Who reviews</FieldLegend>
              <RadioGroup value={step.resolver} onValueChange={(next) => set({ resolver: next as ResolverType })} aria-label="Who reviews">
                {(Object.keys(RESOLVER_LABELS) as ResolverType[]).map((resolver) => (
                  <Field key={resolver} orientation="horizontal">
                    <RadioGroupItem value={resolver} id={`${ids.resolver}-${resolver}`} />
                    <FieldLabel htmlFor={`${ids.resolver}-${resolver}`} className="font-normal">{RESOLVER_LABELS[resolver].label}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
              <FieldDescription>{RESOLVER_LABELS[step.resolver].help}</FieldDescription>
            </FieldSet>

            {step.resolver === "role" ? (
              <>
                <Field>
                  <FieldLabel htmlFor={ids.role}>Role</FieldLabel>
                  <ChoiceCombobox id={ids.role} choices={roleChoices} value={step.roleId === null ? null : String(step.roleId)} onChange={(next) => {
                    const chosen = overview.roles.find((entry) => String(entry.id) === next);
                    // A match only makes sense for the kind of scope the role has.
                    const match: RoleMatch = chosen?.scopeKind === "section" ? "story-section" : chosen?.scopeKind === "media" ? "story-media" : "any";
                    set({ roleId: next === null ? null : Number(next), roleMatch: match });
                  }} placeholder="Search roles…" invalid={step.roleId === null} />
                </Field>
                {role ? (
                  <FieldSet>
                    <FieldLegend variant="label">Which members</FieldLegend>
                    <RadioGroup value={step.roleMatch} onValueChange={(next) => set({ roleMatch: next as RoleMatch })} aria-label="Which members">
                      {matchOptions.map((match) => (
                        <Field key={match} orientation="horizontal"><RadioGroupItem value={match} id={`${ids.match}-${match}`} /><FieldLabel htmlFor={`${ids.match}-${match}`} className="font-normal">{ROLE_MATCH_LABELS[match]}</FieldLabel></Field>
                      ))}
                    </RadioGroup>
                    {role.scopeKind === "none" ? <FieldDescription>{role.name} isn’t scoped, so everyone who holds it is eligible.</FieldDescription> : <FieldDescription>Members who cover everything else are used when nobody covers the story’s {role.scopeKind === "section" ? "Section" : "media"}.</FieldDescription>}
                  </FieldSet>
                ) : null}
              </>
            ) : null}

            {step.resolver === "person" ? (
              <Field>
                <FieldLabel htmlFor={ids.person}>Person</FieldLabel>
                <ChoiceCombobox id={ids.person} choices={people} value={step.userId === null ? null : String(step.userId)} onChange={(next) => set({ userId: next === null ? null : Number(next) })} placeholder="Search people…" invalid={step.userId === null} />
              </Field>
            ) : null}

            <FieldSet>
              <FieldLegend variant="label">If it can’t be routed</FieldLegend>
              <Field orientation="horizontal">
                <Checkbox id={ids.fallback} checked={step.fallback === "editors"} onCheckedChange={(checked) => set({ fallback: checked ? "editors" : "none" })} />
                <FieldLabel htmlFor={ids.fallback} className="font-normal">Send it to the editors’ queue instead</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox id={ids.self} checked={step.selfReview === "allow"} onCheckedChange={(checked) => set({ selfReview: checked ? "allow" : "exclude-writers" })} />
                <FieldLabel htmlFor={ids.self} className="font-normal">Writers may review their own story at this step</FieldLabel>
              </Field>
              <FieldDescription>With neither, a step with nobody eligible keeps the story out of review and tells the editors why.</FieldDescription>
            </FieldSet>

            <Collapsible>
              <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 group/advanced" />}>
                <ChevronDown aria-hidden="true" className="size-4 transition-transform group-data-[panel-open]/advanced:rotate-180" />
                Only for some stories{advancedCount ? ` (${advancedCount})` : ""}
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-4 pt-2">
                <FieldDescription>Leave these empty and the step applies to every story. A step that doesn’t apply is skipped and shown as skipped.</FieldDescription>
                <Field><FieldLabel htmlFor={ids.sections}>Sections</FieldLabel><ChoicesCombobox id={ids.sections} choices={sections} value={step.conditions.sections.map(String)} onChange={(next) => setConditions({ sections: next.map(Number) })} placeholder="Any Section" /></Field>
                <Field><FieldLabel htmlFor={ids.formats}>Story formats</FieldLabel><ChoicesCombobox id={ids.formats} choices={formats} value={step.conditions.formats} onChange={(next) => setConditions({ formats: next })} placeholder="Any format" /></Field>
                <Field orientation="horizontal"><Checkbox id={ids.visuals} checked={step.conditions.onlyWithVisuals} onCheckedChange={(checked) => setConditions({ onlyWithVisuals: Boolean(checked) })} /><FieldLabel htmlFor={ids.visuals} className="font-normal">Only stories with visuals</FieldLabel></Field>
                <Field><FieldLabel htmlFor={ids.media}>Media types</FieldLabel><ChoicesCombobox id={ids.media} choices={media} value={step.conditions.mediaTypes} onChange={(next) => setConditions({ mediaTypes: next })} placeholder="Any media" /></Field>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </div>
        <SheetFooter className="flex-row justify-between">
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onRemove} disabled={!canRemove}>Remove step</Button>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
