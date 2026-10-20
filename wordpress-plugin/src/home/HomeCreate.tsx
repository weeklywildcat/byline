import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { HomeFetchers } from "./home-api";
import type { HomeBootstrap } from "./newsroom-model";
import { activeStory } from "./newsroom-model";
import { homeKey, peekKey } from "./home-query";
import { describeEditorialError, type ContributorEntry } from "../editorial/editorial-model";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, FieldLabel } from "./ui/field";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "./ui/combobox";
import { AssigneePicker, DatePicker } from "./components/pickers";

export function HomeCreate({ kind, onClose, onStoryCreated, fetchers, data, storyId }: { kind: "story" | "task" | null; onClose: () => void; onStoryCreated: (id: number) => void; fetchers: HomeFetchers; data?: HomeBootstrap; storyId?: number | null }) {
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [selectedStoryId, setSelectedStoryId] = useState<number | null>(storyId || null);
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [assignee, setAssignee] = useState<ContributorEntry | null>(null);
  const currentUser = data?.currentUser;
  const people: ContributorEntry[] = [...(data?.people || [])];
  for (const person of [currentUser, ...(data?.stories.flatMap((s) => [...s.authors, s.editor].filter(Boolean)) || [])]) {
    if (person && (!people.some((p) => p.id === person.id)) && (person as { kind?: string }).kind !== "guest") people.push({ ...person, kind: "user" });
  }
  useEffect(() => { setError(""); setSelectedStoryId(storyId || null); setDueAt(null); setAssignee(currentUser ? { ...currentUser, kind: "user" } : null); }, [kind, storyId, currentUser?.id]);
  const create = useMutation({
    mutationFn: async (title: string) => {
      if (kind === "story") return fetchers.createStory!(title);
      if (!selectedStoryId) throw new Error("Choose a story for this task.");
      await fetchers.editorial!.createTask({ title, storyId: selectedStoryId, assigneeId: Number(assignee?.id) || null, dueAt, priority: "normal" });
      return null;
    },
    onSuccess: (story) => {
      void client.invalidateQueries({ queryKey: homeKey });
      if (selectedStoryId) void client.invalidateQueries({ queryKey: peekKey(selectedStoryId) });
      onClose();
      if (story) { toast.success("Story created."); requestAnimationFrame(() => onStoryCreated(story.story.id)); }
    },
    onError: (error) => setError(describeEditorialError(error, kind === "story" ? "The story couldn't be created. Try again." : "The task couldn't be created. Try again."))
  });
  const stories = data?.stories.filter(activeStory) || [];
  return <Dialog open={kind !== null} onOpenChange={(open) => { if (!open && !create.isPending) onClose(); }}><DialogContent className="home-create-dialog"><DialogHeader><DialogTitle>{kind === "task" ? "New task" : "New story"}</DialogTitle><DialogDescription>{kind === "task" ? "Keep the work linked to its story." : "Start with a title. Keep writing in the article editor."}</DialogDescription></DialogHeader><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get("title") || "").trim(); if (title) create.mutate(title); }}>
    <Field><FieldLabel htmlFor="home-create-title">{kind === "task" ? "Task title" : "Story title"}</FieldLabel><Input id="home-create-title" name="title" required maxLength={240} autoFocus disabled={create.isPending} /></Field>
    {kind === "task" ? <div className="home-task-fields"><Field><FieldLabel>Story</FieldLabel><Combobox items={stories} itemToStringLabel={(s) => s.title} isItemEqualToValue={(a, b) => a.id === b.id} value={stories.find((s) => s.id === selectedStoryId) || null} onValueChange={(s) => setSelectedStoryId(s?.id || null)}><ComboboxInput aria-label="Task story" required placeholder="Choose a story…" /><ComboboxContent><ComboboxEmpty>No active stories. Create a story first.</ComboboxEmpty><ComboboxList>{(story: typeof stories[number]) => <ComboboxItem key={story.id} value={story}>{story.title}</ComboboxItem>}</ComboboxList></ComboboxContent></Combobox></Field>{data?.capabilities.review ? <Field><FieldLabel>Assignee</FieldLabel><AssigneePicker people={people} value={assignee} onChange={setAssignee} /></Field> : null}<Field><FieldLabel>Due</FieldLabel><DatePicker label="Task due date" value={dueAt} timezone={data?.timezone || "UTC"} onChange={setDueAt} /></Field></div> : null}
    {error ? <p role="alert" className="home-inline-error">{error}</p> : null}<DialogFooter><Button variant="ghost" type="button" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={create.isPending || (kind === "task" && !selectedStoryId)}>{create.isPending ? "Creating…" : kind === "task" ? "Create task" : "Create story"}</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}
