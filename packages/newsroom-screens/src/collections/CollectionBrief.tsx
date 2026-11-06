import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { describeEditorialError } from "../editorial/editorial-model";
import { useCollectionGuard, useGuardedEditor } from "./collection-guard";
import type { Collection } from "./collection-model";
import type { CollectionActions } from "./collection-query";

/**
 * The reporting brief: what we're covering, why it matters, the angles and
 * what's still missing. Explicit Edit and Save; never autosaved. Saving sends
 * the brief it started from, so someone else's newer brief is a conflict
 * (409), not an overwrite, and the draft stays here to copy or retry.
 */
export function CollectionBrief({ collection, actions }: { collection: Collection; actions: CollectionActions }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(collection.brief);
  const [base, setBase] = useState(collection.brief);
  const edit = useRef<HTMLButtonElement | null>(null);
  const { guard } = useCollectionGuard();
  const dirty = editing && draft !== base;
  useGuardedEditor("brief", "the reporting brief", () => dirty, () => setEditing(false));
  const failure = actions.update.isError && actions.update.variables && "brief" in actions.update.variables ? actions.update.error : null;
  const conflict = (failure as { data?: { status?: number } } | null)?.data?.status === 409;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="collection-brief">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 id="collection-brief" className="text-base font-semibold">Reporting brief</h2>
          <p className="text-sm text-muted-foreground">What we’re covering, why it matters, the angles, and what’s still missing.</p>
        </div>
        {collection.canEdit && !editing ? (
          <Button
            ref={edit}
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(collection.brief);
              setBase(collection.brief);
              actions.update.reset();
              setEditing(true);
            }}
          >
            <Pencil data-icon="inline-start" />
            {collection.brief ? "Edit brief" : "Add brief"}
          </Button>
        ) : null}
      </header>
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            actions.update.mutate(
              { brief: draft, expectedBrief: base },
              {
                onSuccess: (saved) => {
                  setBase(saved.brief);
                  setEditing(false);
                  requestAnimationFrame(() => edit.current?.focus());
                },
              },
            );
          }}
        >
          <Textarea aria-label="Reporting brief and key angles" value={draft} onChange={(e) => setDraft(e.target.value)} rows={8} maxLength={4000} autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={actions.update.isPending} onClick={() => (dirty ? guard(() => setEditing(false)) : setEditing(false))}>
              Cancel
            </Button>
            <Button type="submit" disabled={actions.update.isPending || draft === base}>
              {actions.update.isPending ? "Saving…" : "Save brief"}
            </Button>
          </div>
          {failure ? (
            <InlineAlert>
              {conflict
                ? "Someone else changed the brief while you were editing. Your draft is still here: copy it, reload, and save again."
                : `${describeEditorialError(failure, "The brief could not be saved.")} Your draft is still here.`}
            </InlineAlert>
          ) : null}
        </form>
      ) : collection.brief ? (
        <p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{collection.brief}</p>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">What are we covering, why does it matter, and which angles are we pursuing?</p>
      )}
    </section>
  );
}
