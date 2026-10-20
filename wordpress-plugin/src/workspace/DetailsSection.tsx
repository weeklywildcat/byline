import { useId, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeEditorialError, type ContributorEntry } from "../editorial/editorial-model";
import { AssigneePicker, DatePicker, WritersPicker } from "../home/components/pickers";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "../home/ui/combobox";
import { dateLabel, exactDate } from "../home/newsroom-model";
import { InlineError, SectionFailed, SectionHeading } from "./fields";
import { applyWorkflowPayload, patchStory, type StoryPatch } from "./workspace-cache";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { workspaceError } from "./workspace-errors";
import { names, peopleOptions } from "./workspace-model";
import type { WorkspaceStatus } from "./workspace-types";

type Changes = { status?: string; editorId?: number | null; deadline?: string | null; plannedPublishAt?: string | null };

function Row({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return <div className="ws-detail" role="group" aria-labelledby={id}><dt id={id}>{label}</dt><dd>{children}</dd></div>;
}

/**
 * The story's facts as a compact definition list, not a settings form. A
 * deadline, a planned publication date and a WordPress schedule are three
 * different things, and are labelled so.
 */
export function DetailsSection() {
  const { storyId, editorial, data, timezone, now, caps, currentUserId, reload, announce, sectionError } = useWorkspace();
  const cache = useWorkspaceCache();
  const { story } = data;
  const contributorsFailed = sectionError("contributors");
  const people = peopleOptions(data.people);
  const statuses = data.statuses.filter((status) => status.selectable);
  const wpState = story.wordpressState;
  const scheduled = wpState.isScheduled && wpState.scheduledAt ? ` · ${exactDate(wpState.scheduledAt, timezone)}` : wpState.isPublished && wpState.publishedAt ? ` · ${exactDate(wpState.publishedAt, timezone)}` : "";
  const overdue = Boolean(story.deadline) && !wpState.isPublished && dateLabel(story.deadline, timezone, now).endsWith("overdue");

  const update = useMutation({
    mutationFn: ({ changes, revision }: { changes: Changes; revision: number }) => editorial.updateWorkflow(storyId, { ...changes, expectedRevision: revision }),
    onMutate: async ({ changes }) => {
      await cache.cancel();
      const current = cache.read();
      const previous: StoryPatch = current ? { workflow: current.story.workflow, deadline: current.story.deadline, plannedPublication: current.story.plannedPublication, editor: current.story.editor } : {};
      const patch: StoryPatch = {};
      if (changes.status) { const status = current?.statuses.find((candidate) => candidate.id === changes.status); if (status) patch.workflow = status as WorkspaceStatus as never; }
      if (changes.deadline !== undefined) patch.deadline = changes.deadline;
      if (changes.plannedPublishAt !== undefined) patch.plannedPublication = changes.plannedPublishAt;
      if (changes.editorId !== undefined) { const person = current?.people.find((candidate) => Number(candidate.id) === changes.editorId); patch.editor = person ? { id: Number(person.id), name: person.name } : null; }
      cache.write((data) => patchStory(data, patch));
      return { previous, revision: current?.revision };
    },
    onSuccess: (payload) => { cache.write((current) => applyWorkflowPayload(current, payload)); announce("Story details saved."); },
    onError: (error, _vars, context) => {
      if (context) cache.write((current) => { const reverted = patchStory(current, context.previous); return reverted && context.revision !== undefined ? { ...reverted, revision: context.revision } : reverted; });
      const failure = workspaceError(error, "The story couldn't be updated. Try again.");
      toast.error(failure.message);
      announce(failure.message);
    },
    onSettled: () => { void cache.invalidate(); }
  });
  const save = (changes: Changes) => update.mutate({ changes, revision: data.revision });

  const writers = useMutation({
    mutationFn: (value: ContributorEntry[]) => editorial.saveContributors(storyId, value),
    onSuccess: (payload) => { cache.write((current) => current ? { ...current, contributors: { ...payload, contributors: payload.contributors.map((person) => ({ ...person, kind: person.kind ?? "user" })), available: (payload.available ?? current.contributors.available ?? []).map((person) => ({ ...person, kind: person.kind ?? "user" })) } } : current); announce("Writers saved."); },
    onError: (error) => { const message = describeEditorialError(error, "Writers couldn't be saved. Try again."); toast.error(message); announce(message); },
    onSettled: () => { void cache.invalidate(); }
  });

  const editor = story.editor ? people.find((person) => Number(person.id) === story.editor!.id) ?? { id: story.editor.id, kind: "user" as const, name: story.editor.name } : null;
  const busy = update.isPending;

  return <section aria-labelledby="ws-details" className="ws-section ws-details-section">
    <SectionHeading id="ws-details" title="Details" />
    <dl className="ws-details">
      <Row label="Workflow">
        {caps.changeStatus ? <Combobox items={statuses} value={data.statuses.find((status) => status.id === story.workflow.id) || null} itemToStringLabel={(status: WorkspaceStatus) => status.label} isItemEqualToValue={(a: WorkspaceStatus, b: WorkspaceStatus) => a.id === b.id} onValueChange={(status: WorkspaceStatus | null) => { if (status && status.id !== story.workflow.id) save({ status: status.id }); }} disabled={busy}>
          <ComboboxInput aria-label="Workflow" />
          <ComboboxContent><ComboboxList>{(status: WorkspaceStatus) => <ComboboxItem key={status.id} value={status}>{status.label}</ComboboxItem>}</ComboboxList></ComboboxContent>
        </Combobox> : story.workflow.label}
      </Row>
      <Row label="Writers">
        {contributorsFailed ? <SectionFailed what="writers" onRetry={() => void reload()} /> : data.contributors.canEdit ? <WritersPicker people={data.contributors.available || []} value={data.contributors.contributors} onChange={(value) => writers.mutate(value)} disabled={writers.isPending} /> : names(data.contributors.contributors) || names(story.authors) || "None"}
      </Row>
      <Row label="Editor">
        {caps.assign ? <AssigneePicker people={people} value={editor} onChange={(person) => save({ editorId: person ? Number(person.id) : null })} disabled={busy} /> : story.editor?.name || "None"}
      </Row>
      <Row label="Story deadline">
        {caps.assign ? <DatePicker label="Story deadline" dateOnly value={story.deadline} timezone={timezone} disabled={busy} onChange={(deadline) => save({ deadline })} /> : <>{exactDate(story.deadline, timezone)}</>}
        {overdue ? <span className="ws-overdue ws-detail-note">Overdue</span> : null}
      </Row>
      <Row label="Publication target">
        {caps.assign ? <DatePicker label="Publication target" value={story.plannedPublication} timezone={timezone} disabled={busy} onChange={(plannedPublishAt) => save({ plannedPublishAt })} /> : <>{exactDate(story.plannedPublication, timezone)}</>}
      </Row>
      <Row label="WordPress state">{wpState.label}{scheduled}</Row>
      <Row label="Section">{data.sections.join(", ") || "None"}</Row>
    </dl>
    {update.isError && update.error && workspaceError(update.error).conflict ? <InlineError onRetry={() => void reload()} retryLabel="Reload">{workspaceError(update.error).message}</InlineError> : null}
  </section>;
}
