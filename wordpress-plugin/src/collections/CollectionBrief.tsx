import { useRef, useState } from "react";
import { AlertDialogTrigger } from "../admin-ui/ui/alert-dialog";
import { ConfirmRemoveDialog } from "../workspace/dialog-shell";
import { Pencil } from "lucide-react";
import { Button } from "../admin-ui/ui/button";
import { Textarea } from "../admin-ui/ui/textarea";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import type { Collection } from "./collection-model";
import type { ReturnTypeOfCollectionActions } from "./collection-query";
export function CollectionBrief({
  collection,
  actions,
}: {
  collection: Collection;
  actions: ReturnTypeOfCollectionActions;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(collection.brief);
  const edit = useRef<HTMLButtonElement | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Reporting brief</h2>
          <p className="text-sm text-muted-foreground">
            The plan, key angles, and what we’re still missing.
          </p>
        </div>
        {collection.canEdit && !editing ? (
          <Button
            ref={edit}
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(collection.brief);
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
            actions.update.mutate(
              { brief: draft, expectedBrief: collection.brief },
              {
                onSuccess: () => {
                  setEditing(false);
                  requestAnimationFrame(() => edit.current?.focus());
                },
              },
            );
          }}
        >
          <Textarea
            aria-label="Reporting brief and key angles"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            maxLength={4000}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            {draft !== collection.brief ? (
              <ConfirmRemoveDialog
                title="Discard unsaved brief changes?"
                description="Your edits to the Collection brief haven't been saved."
                confirmLabel="Discard changes"
                onConfirm={() => setEditing(false)}
              >
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actions.update.isPending}
                    />
                  }
                >
                  Cancel
                </AlertDialogTrigger>
              </ConfirmRemoveDialog>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              disabled={actions.update.isPending || draft === collection.brief}
            >
              Save brief
            </Button>
          </div>
          {actions.update.isError ? (
            <InlineAlert>
              Brief could not be saved. Your draft is still here.
            </InlineAlert>
          ) : null}
        </form>
      ) : collection.brief ? (
        <p className="max-w-prose text-sm/relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">
          {collection.brief}
        </p>
      ) : (
        <p className="py-3 text-sm text-muted-foreground">
          What are we covering, why does it matter, and which angles are we
          pursuing?
        </p>
      )}
    </section>
  );
}
