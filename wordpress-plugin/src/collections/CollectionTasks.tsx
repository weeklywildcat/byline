import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TaskRow } from "../story/rows";
import { TaskEditDialog } from "../story/TaskEditDialog";
import { useUpdateTask } from "../story/use-update-task";
import { ItemGroup } from "../admin-ui/ui/item";
import { Button } from "../admin-ui/ui/button";
import { Checkbox } from "../admin-ui/ui/checkbox";
import type { StoryFetchers } from "../story/story-fetchers";
import type {
  ContributorEntry,
  EditorialTask,
} from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { toast } from "sonner";
import { collectionKey } from "./collection-api";
import { CollectionEmpty } from "./collection-ui";
import type { CollectionDetail } from "./collection-model";
export function CollectionTasks({
  detail,
  fetchers,
  people,
  timezone,
  refresh,
  preview = false,
}: {
  detail: CollectionDetail;
  fetchers: StoryFetchers;
  people: ContributorEntry[];
  timezone: string;
  refresh: () => Promise<unknown>;
  preview?: boolean;
}) {
  const [editing, setEditing] = useState<EditorialTask | null>(null);
  const client = useQueryClient();
  const update = useUpdateTask(fetchers);
  const complete = useMutation({
    mutationFn: (task: EditorialTask) =>
      fetchers.editorial!.updateTask(task.id, {
        state: task.state === "open" ? "completed" : "open",
      }),
    onMutate: async (task) => {
      await client.cancelQueries({
        queryKey: collectionKey(detail.collection.id),
      });
      client.setQueryData<CollectionDetail>(
        collectionKey(detail.collection.id),
        (old) =>
          old
            ? {
                ...old,
                tasks: old.tasks.map((t) =>
                  t.id === task.id
                    ? {
                        ...t,
                        state: task.state === "open" ? "completed" : "open",
                      }
                    : t,
                ),
              }
            : old,
      );
    },
    onError: (e) => toast.error(describeEditorialError(e)),
    onSettled: refresh,
  });
  const open = detail.tasks.filter((t) => t.state === "open");
  const done = detail.tasks.filter((t) => t.state === "completed");
  return (
    <>
      <ItemGroup className="gap-0">
        {open.slice(0, preview ? 5 : undefined).map((task) => (
          <TaskRow
            key={task.id}
            compact
            task={task}
            timezone={timezone}
            now={new Date()}
            people={people}
            canAssign={detail.collection.canDuplicate}
            pending={complete.isPending}
            onComplete={() => complete.mutate(task)}
            onEdit={() => setEditing(task)}
            onUpdate={(patch, optimistic) => {
              update.mutate(
                { task, patch, optimistic },
                { onSettled: refresh },
              );
            }}
          />
        ))}
      </ItemGroup>
      {!open.length ? (
        <CollectionEmpty title="No open tasks">
          Add the work that supports this reporting effort.
        </CollectionEmpty>
      ) : null}
      {!preview && done.length ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {done.length} completed tasks
          </summary>
          <ItemGroup className="mt-2 gap-1">
            {done.map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-3 p-3 text-sm"
              >
                <Checkbox
                  checked
                  aria-label={`Reopen ${task.title}`}
                  disabled={complete.isPending}
                  onCheckedChange={() => complete.mutate(task)}
                />
                <span className="text-muted-foreground line-through">
                  {task.title}
                </span>
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
        canAssign={Boolean(detail.collection.canDuplicate)}
        timezone={timezone}
        onClose={() => {
          setEditing(null);
          void refresh();
        }}
      />
    </>
  );
}
