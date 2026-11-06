import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TaskRow } from "../story/rows";
import { TaskEditDialog } from "../story/TaskEditDialog";
import { useUpdateTask } from "../story/use-update-task";
import { ItemGroup } from "@byline/newsroom-ui/ui/item";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import type { ContributorEntry, EditorialTask } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { collectionKey } from "./collection-api";
import { useCollectionHost } from "./collection-host";
import { CollectionEmpty } from "./collection-ui";
import type { CollectionDetail } from "./collection-model";

/**
 * Collection tasks, in the canonical task engine and its rows: complete and
 * reopen, quick edits, the full task dialog. `storyLabels` lists Story tasks
 * (the coordinators' roll-up) with the story each belongs to.
 */
export function CollectionTasks({
  detail,
  people,
  timezone,
  refresh,
  preview = false,
  storyLabels = false,
}: {
  detail: CollectionDetail;
  people: ContributorEntry[];
  timezone: string;
  refresh: () => Promise<unknown>;
  preview?: boolean;
  storyLabels?: boolean;
}) {
  const host = useCollectionHost();
  const fetchers = host.fetchers;
  const [editing, setEditing] = useState<EditorialTask | null>(null);
  const client = useQueryClient();
  const update = useUpdateTask(fetchers);
  const key = collectionKey(detail.collection.id);
  const field = storyLabels ? "storyTasks" : "tasks";
  const complete = useMutation({
    mutationFn: (task: EditorialTask) => fetchers.editorial!.updateTask(task.id, { state: task.state === "open" ? "completed" : "open" }),
    onMutate: async (task) => {
      await client.cancelQueries({ queryKey: key });
      client.setQueryData<CollectionDetail>(key, (old) =>
        old ? { ...old, [field]: (old[field] ?? []).map((t) => (t.id === task.id ? { ...t, state: task.state === "open" ? "completed" : "open" } : t)) } : old,
      );
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: refresh,
  });
  const titles = new Map(detail.stories.map((story) => [story.id, story.title]));
  const open = detail.tasks.filter((t) => t.state === "open");
  const done = detail.tasks.filter((t) => t.state === "completed");
  const canAssign = Boolean(detail.collection.canEdit);
  return (
    <>
      <ItemGroup className="gap-0">
        {open.slice(0, preview ? 5 : undefined).map((task) => (
          <TaskRow
            key={task.id}
            compact
            task={task}
            storyTitle={task.storyId ? titles.get(task.storyId) : undefined}
            timezone={timezone}
            now={new Date()}
            people={people}
            canAssign={canAssign}
            pending={complete.isPending}
            onComplete={() => complete.mutate(task)}
            onEdit={() => setEditing(task)}
            onUpdate={(patch, optimistic) => {
              update.mutate({ task, patch, optimistic }, { onSettled: refresh });
            }}
          />
        ))}
      </ItemGroup>
      {!open.length ? (
        storyLabels ? null : <CollectionEmpty title="No open tasks">Add the work that supports this reporting effort.</CollectionEmpty>
      ) : null}
      {!preview && done.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {done.length} completed {done.length === 1 ? "task" : "tasks"}
          </summary>
          <ItemGroup className="mt-2 gap-1">
            {done.map((task) => (
              <div key={task.id} className="flex items-center gap-3 p-3 text-sm">
                <Checkbox checked aria-label={`Reopen ${task.title}`} disabled={complete.isPending} onCheckedChange={() => complete.mutate(task)} />
                <span className="text-muted-foreground line-through">{task.title}</span>
              </div>
            ))}
          </ItemGroup>
        </details>
      ) : null}
      <TaskEditDialog
        open={Boolean(editing)}
        task={editing}
        fetchers={fetchers}
        people={people}
        canAssign={canAssign}
        timezone={timezone}
        onClose={() => {
          setEditing(null);
          void refresh();
        }}
      />
    </>
  );
}
