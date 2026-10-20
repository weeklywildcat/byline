import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { EmptyState } from "../admin-ui/components/empty-state";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { Panel } from "../admin-ui/components/panel";
import { Button } from "../admin-ui/ui/button";
import { Field, FieldDescription, FieldLabel } from "../admin-ui/ui/field";
import { Textarea } from "../admin-ui/ui/textarea";
import { SectionFailed } from "./parts";
import { BRIEF_MAX } from "./reporting-model";
import { useWorkspace, useWorkspaceCache } from "./workspace-context";
import { applyBrief } from "./workspace-cache";
import { workspaceError, type WorkspaceError } from "./workspace-errors";

/** The internal one-paragraph brief. Never article copy; the article editor owns the story's words. */
export function BriefSection() {
  const { storyId, client, data, caps, reload, announce, sectionError } = useWorkspace();
  const cache = useWorkspaceCache();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<WorkspaceError | null>(null);
  const edit = useRef<HTMLButtonElement | null>(null);
  const failed = sectionError("brief");
  const canEdit = caps.editBrief && !failed;

  const save = useMutation({
    mutationFn: ({ text, expected }: { text: string; expected: string }) => client.saveBrief(storyId, text, expected),
    onMutate: async ({ text }) => {
      setError(null);
      await cache.cancel();
      const previous = cache.read()?.brief ?? "";
      cache.write((current) => applyBrief(current, text));
      return { previous };
    },
    onSuccess: (response) => {
      cache.write((current) => applyBrief(current, response.brief));
      setEditing(false);
      announce("Brief saved.");
      requestAnimationFrame(() => edit.current?.focus());
    },
    onError: (failure, _text, context) => {
      cache.write((current) => applyBrief(current, context?.previous ?? ""));
      setError(workspaceError(failure, "The brief couldn't be saved. Try again."));
    },
    onSettled: () => { void cache.invalidate(); }
  });

  const start = () => { setDraft(data.brief); setError(null); setEditing(true); };
  const cancel = () => { setEditing(false); setError(null); requestAnimationFrame(() => edit.current?.focus()); };
  const reloadBrief = async () => { await reload(); setEditing(false); setError(null); };

  return <Panel id="ws-brief" title="Brief" description="Internal, not article copy."
    action={canEdit && !editing ? <Button ref={edit} type="button" variant="outline" size="sm" onClick={start}><Pencil data-icon="inline-start" aria-hidden="true" />{data.brief ? "Edit" : "Add brief"}</Button> : null}>
    {failed ? <SectionFailed what="the brief" onRetry={() => void reload()} /> : editing
      ? <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate({ text: draft, expected: data.brief }); }}>
        <Field>
          <FieldLabel htmlFor="ws-brief-input" className="sr-only">Brief</FieldLabel>
          <Textarea id="ws-brief-input" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={BRIEF_MAX} rows={5} autoFocus disabled={save.isPending} />
          <FieldDescription aria-live="polite" className="tabular-nums">{draft.length}/{BRIEF_MAX}</FieldDescription>
        </Field>
        {error ? <InlineAlert onAction={error.conflict ? () => void reloadBrief() : undefined} actionLabel="Reload latest">{error.message}</InlineAlert> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || draft === data.brief}>{save.isPending ? "Saving…" : "Save brief"}</Button>
        </div>
      </form>
      : data.brief ? <p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{data.brief}</p>
        : <EmptyState title="No brief yet." description={canEdit ? "Say what this story is, in a few lines." : undefined} />}
  </Panel>;
}
