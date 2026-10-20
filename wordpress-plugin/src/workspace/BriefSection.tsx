import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../home/ui/button";
import { Textarea } from "../home/ui/textarea";
import { InlineError, SectionFailed, SectionHeading } from "./fields";
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

  return <section aria-labelledby="ws-brief" className="ws-section ws-brief">
    <SectionHeading id="ws-brief" title="Brief">
      <span className="ws-caption">Internal — not article copy</span>
      {canEdit && !editing ? <Button ref={edit} type="button" variant="ghost" size="sm" className="ws-add" onClick={start}><Pencil aria-hidden="true" />{data.brief ? "Edit" : "Add brief"}</Button> : null}
    </SectionHeading>
    {failed ? <SectionFailed what="the brief" onRetry={() => void reload()} /> : editing ? <form className="ws-brief-form" onSubmit={(event) => { event.preventDefault(); if (!save.isPending) save.mutate({ text: draft, expected: data.brief }); }}>
      <Textarea aria-label="Brief" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={BRIEF_MAX} rows={5} autoFocus className="ws-textarea ws-brief-input" disabled={save.isPending} />
      <div className="ws-brief-actions">
        <span className="ws-count" aria-live="polite">{draft.length}/{BRIEF_MAX}</span>
        <Button type="button" variant="ghost" onClick={cancel} disabled={save.isPending}>Cancel</Button>
        <Button type="submit" disabled={save.isPending || draft === data.brief}>{save.isPending ? "Saving…" : "Save brief"}</Button>
      </div>
      {error ? <InlineError>{error.message}{error.conflict ? <> <Button type="button" variant="link" onClick={() => void reloadBrief()}>Reload latest</Button></> : null}</InlineError> : null}
    </form> : data.brief ? <p className="ws-brief-text">{data.brief}</p> : <p className="ws-empty">{canEdit ? "No brief yet. Say what this story is, in a few lines." : "No brief."}</p>}
  </section>;
}
