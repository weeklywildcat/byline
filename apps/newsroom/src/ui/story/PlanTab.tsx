"use client";

import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LIMITS, RESOURCE_PURPOSE_OPTIONS, WORKFLOW_OPTIONS } from "../../domain/vocabulary";
import { patchJson } from "./api";
import { relationIdOf } from "./form";
import { formatDay, Property, SectionHeading } from "./parts";
import { SinglePicker, useOptions } from "./RelationPickers";
import type { StoryScreenContext } from "./StoryScreen";
import type { StoryPlanDoc } from "./types";

const editorRoles = { "where[role][in]": "editor,administrator", "where[enabled][equals]": "true" };

/**
 * Plan: the story's newsroom plan. It is its own unversioned record, so every
 * change here applies immediately and never travels with autosave or a version
 * restore. The server decides what each person may change; editor, deadline
 * and planned publication are editors' decisions.
 */
export function PlanTab({ context, plan, error, onChange, onRetry }: { context: StoryScreenContext; plan: StoryPlanDoc | null; error: string | null; onChange: (plan: StoryPlanDoc) => void; onRetry: () => void }) {
  const isEditor = context.role === "editor" || context.role === "administrator";
  const editors = useOptions(context.api, "users", "name", isEditor ? editorRoles : { "where[id][equals]": "0" });
  const [brief, setBrief] = useState(plan?.brief ?? "");
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => setBrief(plan?.brief ?? ""), [plan?.brief]);

  if (error) return <InlineAlert title="The plan could not be loaded." onAction={onRetry}>{error}</InlineAlert>;
  if (!plan) return <p className="text-sm text-muted-foreground">Loading the plan…</p>;
  const current = plan;

  async function save(changes: Partial<StoryPlanDoc>, success?: string) {
    setSaving(true);
    try {
      const result = await patchJson<{ doc: StoryPlanDoc }>(context.api, `/story-plans/${current.id}?depth=1`, changes);
      onChange(result.doc);
      if (success) toast.success(success);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "That change was not saved.");
    } finally {
      setSaving(false);
    }
  }

  const resources = current.resources ?? [];
  function addLink() {
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    void save({ resources: [...resources, { label: linkLabel.trim(), url: linkUrl.trim(), purpose: "other" }] }, "Link added.").then(() => {
      setLinkLabel("");
      setLinkUrl("");
    });
  }
  const purposeLabel = (purpose?: string | null) => RESOURCE_PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label ?? "Link";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <section aria-labelledby="plan-details" className="flex flex-col gap-2">
        <SectionHeading><span id="plan-details">Details</span></SectionHeading>
        <FieldGroup className="gap-1">
          <Property label="Workflow">
            <Select items={WORKFLOW_OPTIONS.map((option) => ({ value: option.value, label: option.label }))} value={current.workflow} disabled={saving || context.readOnly}
              onValueChange={(next) => { if (next && next !== current.workflow) void save({ workflow: next }, "Workflow updated."); }}>
              <SelectTrigger aria-label="Workflow" className="-ml-2 h-7 w-fit border-transparent bg-transparent px-2 hover:bg-muted"><SelectValue /></SelectTrigger>
              <SelectContent>{WORKFLOW_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </Property>
          <Property label="Editor">
            {isEditor ? (
              <SinglePicker label="Editor" placeholder="No editor" options={editors} value={relationIdOf(current.editor)} onChange={(id) => void save({ editor: id }, "Editor assigned.")} disabled={saving} />
            ) : (
              <span>{current.editor && typeof current.editor === "object" ? current.editor.name : "None"}</span>
            )}
          </Property>
          <Property label="Deadline" htmlFor="plan-deadline">
            {isEditor ? (
              <Input id="plan-deadline" type="date" className="w-fit" value={current.deadline ?? ""} disabled={saving} onChange={(event) => void save({ deadline: event.target.value || null }, "Deadline updated.")} />
            ) : (
              <span>{current.deadline ? formatDay(current.deadline, context.timeZone) : "None"}</span>
            )}
          </Property>
          <Property label="Planned publication">
            <span>{current.plannedPublication ? formatDay(current.plannedPublication, context.timeZone) : "Not planned"}</span>
          </Property>
        </FieldGroup>
      </section>

      <section aria-labelledby="plan-brief" className="flex flex-col gap-2">
        <SectionHeading><span id="plan-brief">Brief</span></SectionHeading>
        <Textarea aria-labelledby="plan-brief" rows={5} maxLength={LIMITS.brief} value={brief} disabled={saving || context.readOnly} placeholder="The angle, reporting direction and context. Private to the newsroom."
          onChange={(event) => setBrief(event.target.value)}
          onBlur={() => { if (brief !== (current.brief ?? "")) void save({ brief }, "Brief saved."); }} />
      </section>

      <section aria-labelledby="plan-links" className="flex flex-col gap-2">
        <SectionHeading><span id="plan-links">Files &amp; links</span></SectionHeading>
        {resources.length > 0 ? (
          <ItemGroup>
            {resources.map((resource, index) => (
              <Item key={resource.id ?? index} size="sm" variant="outline">
                <ItemContent>
                  <ItemTitle><a href={resource.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">{resource.label}<ExternalLink className="size-3" aria-hidden="true" /></a></ItemTitle>
                  <ItemDescription>{purposeLabel(resource.purpose)}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${resource.label}`} disabled={saving || context.readOnly} onClick={() => void save({ resources: resources.filter((_, other) => other !== index) }, "Link removed.")}>
                    <X aria-hidden="true" />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : <p className="text-sm text-muted-foreground">No files or links yet. Paste the working draft, notes or a folder.</p>}
        {/* Not a <form>: this screen lives inside Payload's document form. */}
        <div className="flex flex-wrap items-center gap-2" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addLink(); } }}>
          <Input aria-label="Link name" placeholder="Name" className="w-40" value={linkLabel} onChange={(event) => setLinkLabel(event.target.value)} disabled={saving || context.readOnly} />
          <Input aria-label="Link address" type="url" placeholder="https://" className="min-w-48 flex-1" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} disabled={saving || context.readOnly} />
          <Button type="button" variant="outline" size="sm" onClick={addLink} disabled={saving || context.readOnly || resources.length >= LIMITS.resourcesPerStory}>Add link</Button>
        </div>
      </section>
    </div>
  );
}
