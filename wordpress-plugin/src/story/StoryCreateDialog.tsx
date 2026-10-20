import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError } from "../editorial/editorial-model";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Button } from "../admin-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../admin-ui/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "../admin-ui/ui/field";
import { Input } from "../admin-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import type { StoryWorkspace } from "../workspace/workspace-types";
import type { StoryFetchers } from "./story-fetchers";
import { invalidateStoryData } from "./story-query";

export type StoryCreateDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after the draft exists. Both Home and Stories open the full Story Workspace here. */
  onCreated: (story: StoryWorkspace) => void;
  fetchers: StoryFetchers;
};

/** The one New story experience: a title and an optional template. Reporting is planned in the workspace. */
export function StoryCreateDialog({ open, onClose, onCreated, fetchers }: StoryCreateDialogProps) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [preset, setPreset] = useState("");
  // Templates are optional: if they cannot be listed, title-only creation is unchanged.
  const presets = useQuery({ queryKey: ["byline", "story-create-presets"], queryFn: () => fetchers.getPresets!(), enabled: open && Boolean(fetchers.getPresets), staleTime: 300_000, retry: false });
  const templates = presets.data ? (presets.data.types?.length ? presets.data.types.map((id) => presets.data!.presets[id]) : Object.values(presets.data.presets)).filter((item) => item?.id && item.label) : [];
  const create = useMutation({
    mutationFn: (title: string) => fetchers.createStory!(title, preset || undefined),
    onSuccess: (story) => {
      void invalidateStoryData(client);
      setPreset("");
      onClose();
      toast.success("Story created.");
      // The draft always exists. If its template could not fully apply, stay here long enough to say so.
      if (story.template?.errors?.length) toast.warning(`The template couldn't be fully applied. ${story.template.errors[0]}`, { duration: 15_000, action: { label: "Open workspace", onClick: () => onCreated(story) } });
      else requestAnimationFrame(() => onCreated(story));
    },
    onError: (failure) => setError(describeEditorialError(failure, "The story couldn't be created. Try again."))
  });
  const templateItems = [{ value: "none", label: "No template" }, ...templates.map((item) => ({ value: item.id, label: item.label }))];
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !create.isPending) { setError(""); onClose(); } }}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>New story</DialogTitle><DialogDescription>Start with a title. Plan the reporting in the story workspace.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get("title") || "").trim(); if (title) { setError(""); create.mutate(title); } }}>
        <FieldGroup className="gap-4">
          <Field><FieldLabel htmlFor="story-create-title">Story title</FieldLabel><Input id="story-create-title" name="title" required maxLength={240} autoFocus disabled={create.isPending} /></Field>
          {templates.length ? <Field><FieldLabel htmlFor="story-create-template">Template</FieldLabel>
            <Select items={templateItems} value={preset || "none"} disabled={create.isPending} onValueChange={(next) => setPreset(!next || next === "none" ? "" : next)}><SelectTrigger id="story-create-template" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{templateItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          </Field> : null}
          {error ? <InlineAlert>{error}</InlineAlert> : null}
        </FieldGroup>
        <DialogFooter className="mt-4"><Button variant="outline" type="button" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create story"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
