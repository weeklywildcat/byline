import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { describeEditorialError, type ContributorEntry } from "../editorial/editorial-model";
import { DatePicker, WritersPicker } from "../editorial/pickers";
import { useWorkloadHints } from "../editorial/workload-hints";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { DialogRoot as Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/adaptive-dialog";
import { Field, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData } from "./story-query";

export type StoryCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after the draft exists. Both Home and Stories open the Story here. */
  onCreated: (story: StoryWorkspace) => void;
  fetchers: StoryFetchers;
};

/**
 * The one New story experience (docs/story-lifecycle.md#create): what's the
 * story, then Create pitch. Section, writers, deadline and a template are
 * optional details behind "Add details" — only the ones this host and reader
 * may set. Sources, media, tasks and review routing all come later, in the
 * Story.
 */
export function StoryCreateDialog({ open, onClose, onCreated, fetchers }: StoryCreateDialogProps) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState(false);
  const [preset, setPreset] = useState("");
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [writers, setWriters] = useState<ContributorEntry[] | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);
  // Templates and details are optional: if they cannot be listed, title-only creation is unchanged.
  const presets = useQuery({ queryKey: ["byline", "story-create-presets"], queryFn: () => fetchers.getPresets!(), enabled: open && Boolean(fetchers.getPresets), staleTime: 300_000, retry: false });
  const templates = presets.data ? (presets.data.types?.length ? presets.data.types.map((id) => presets.data!.presets[id]) : Object.values(presets.data.presets)).filter((item) => item?.id && item.label) : [];
  const options = presets.data?.create;
  const hints = useWorkloadHints(fetchers.getWorkloadHints, open && Boolean(options?.writers));
  const reset = () => { setError(""); setTitle(""); setDetails(false); setPreset(""); setSectionId(null); setWriters(null); setDeadline(null); };
  const create = useMutation({
    mutationFn: (text: string) => fetchers.createStory!(text, preset || undefined, { sectionId, writerIds: writers?.map((person) => Number(person.id)), deadline }),
    onSuccess: (story) => {
      void invalidateStoryData(client);
      reset();
      onClose();
      toast.success("Pitch created.");
      // The draft always exists. If its template could not fully apply, stay here long enough to say so.
      if (story.template?.errors?.length) toast.warning(`The template couldn't be fully applied. ${story.template.errors[0]}`, { duration: 15_000, action: { label: "Open story", onClick: () => onCreated(story) } });
      else requestAnimationFrame(() => onCreated(story));
    },
    onError: (failure) => setError(describeEditorialError(failure, "The story couldn't be created. Try again."))
  });
  const busy = create.isPending;
  const missing = Boolean(error) && !title.trim();
  const templateItems = [{ value: "none", label: "No template" }, ...templates.map((item) => ({ value: item.id, label: item.label }))];
  const sectionItems = [{ value: "none", label: "No section yet" }, ...(options?.sections ?? []).map((section) => ({ value: String(section.id), label: section.name }))];
  const hasDetails = templates.length > 0 || Boolean(options?.sections.length) || Boolean(options?.canAssign);
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) { reset(); onClose(); } }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New story</DialogTitle><DialogDescription>It starts as a pitch. Everything else can wait.</DialogDescription></DialogHeader>
      <form noValidate onSubmit={(event) => { event.preventDefault(); const text = title.trim(); if (!text) { setError("Say what the story is."); return; } setError(""); create.mutate(text); }}>
        <FieldGroup className="gap-4">
          <Field data-invalid={missing || undefined}>
            <FieldLabel htmlFor="story-create-title">What's the story?</FieldLabel>
            <Input id="story-create-title" name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} disabled={busy} placeholder="Canteen could return next semester" aria-invalid={missing || undefined} />
          </Field>
          {hasDetails ? <Collapsible open={details} onOpenChange={setDetails}>
            <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit" />}>{details ? "Hide details" : "Add details"}<ChevronDown data-icon="inline-end" aria-hidden="true" className={details ? "rotate-180" : undefined} /></CollapsibleTrigger>
            <CollapsibleContent>
              <FieldGroup className="gap-4 pt-3" data-story-create-details="">
                {options?.sections.length ? <Field><FieldLabel htmlFor="story-create-section">Section</FieldLabel>
                  <Select items={sectionItems} value={sectionId ? String(sectionId) : "none"} disabled={busy} onValueChange={(next) => setSectionId(!next || next === "none" ? null : Number(next))}><SelectTrigger id="story-create-section" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{sectionItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
                </Field> : null}
                {options?.canAssign ? <>
                  <Field><FieldLabel>Writers</FieldLabel><WritersPicker appearance="field" people={options.writers} value={writers ?? []} onChange={setWriters} disabled={busy} hints={hints} /></Field>
                  <Field><FieldLabel>Deadline</FieldLabel><DatePicker label="Deadline" dateOnly value={deadline} timezone="UTC" onChange={setDeadline} disabled={busy} placeholder="No deadline" /></Field>
                </> : null}
                {templates.length ? <Field><FieldLabel htmlFor="story-create-template">Template</FieldLabel>
                  <Select items={templateItems} value={preset || "none"} disabled={busy} onValueChange={(next) => setPreset(!next || next === "none" ? "" : next)}><SelectTrigger id="story-create-template" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{templateItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
                </Field> : null}
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible> : null}
          {error ? <InlineAlert>{error}</InlineAlert> : null}
        </FieldGroup>
        <DialogFooter className="mt-4"><Button variant="outline" type="button" onClick={() => { reset(); onClose(); }} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <><Spinner data-icon="inline-start" />Creating…</> : "Create pitch"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
