import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TextField, SelectField } from "../admin-ui/components/form-fields";
import { Button } from "../admin-ui/ui/button";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import {
  mediaLibraryAvailable,
  pickFromMediaLibrary,
} from "../workspace/media-library";
import { useDebouncedValue } from "../admin-ui/lib/hooks";
import { describeEditorialError } from "../editorial/editorial-model";
import type { CollectionApi } from "./collection-api";
import {
  edgeChanges,
  type CollectionDetail,
  type SharedResource,
} from "./collection-model";
import { EntityPicker, StoryOption } from "./collection-ui";
export function CollectionAddDialog({
  kind,
  api,
  detail,
  onClose,
  onSaved,
}: {
  kind: "existing" | "interview" | "resource";
  api: CollectionApi;
  detail: CollectionDetail;
  onClose: () => void;
  onSaved: (interviewId?: number) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("new");
  const [attachment, setAttachment] = useState(0);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [selected, setSelected] = useState(detail.stories);
  const [resources, setResources] = useState<SharedResource[]>([]);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const [attempted, setAttempted] = useState(false);
  const stories = useQuery({
    queryKey: ["byline", "collection-story-options", debounced],
    queryFn: () => api.stories(debounced),
    enabled: kind === "existing",
  });
  const available = useQuery({
    queryKey: ["byline", "resource-options", debounced],
    queryFn: () => api.resourceOptions(debounced),
    enabled: kind === "resource" && mode === "existing",
  });
  const save = useMutation({
    mutationFn: async () => {
      const id = detail.collection.id;
      if (kind === "existing") {
        for (const change of edgeChanges(
          detail.collection.storyIds,
          selected.map((s) => s.id),
        ))
          await api.link(id, "story", change.target, change.linked);
      } else if (kind === "interview")
        return (await api.interview(id, { interviewee: title.trim() })).id;
      else if (mode === "existing") {
        for (const resource of resources)
          await api.link(id, "resource", resource.id, true);
      } else
        await api.resource(id, {
          label: title.trim(),
          url,
          ...(attachment ? { attachmentId: attachment } : {}),
        });
    },
    onSuccess: onSaved,
  });
  const name =
    kind === "existing"
      ? "Add existing story"
      : kind === "interview"
      ? "New interview"
      : "Add resource";
  const options = [
    ...new Map(
      [...detail.stories, ...(stories.data?.stories || [])].map((s) => [
        s.id,
        s,
      ]),
    ).values(),
  ];
  const valid =
    kind === "existing" ||
    (kind === "resource" && mode === "existing"
      ? resources.length > 0
      : Boolean(title.trim()) &&
        (kind !== "resource" || attachment > 0 || /^https?:\/\//.test(url)));
  return (
    <WorkspaceDialog
      open
      title={name}
      description={
        kind === "existing"
          ? "Link reporting without moving or duplicating it."
          : `Shared reporting for ${detail.collection.name}.`
      }
      submitLabel={kind === "existing" ? "Save story links" : name}
      onClose={onClose}
      finalFocus={() => null}
      modal={!mediaOpen}
      pending={save.isPending}
      error={
        save.isError
          ? describeEditorialError(save.error)
          : stories.isError || available.isError
          ? "The search could not be loaded. Try again."
          : attempted && !valid
          ? "Complete the required fields."
          : undefined
      }
      onSubmit={() => {
        setAttempted(true);
        if (valid) save.mutate();
      }}
    >
      {kind === "existing" ? (
        <EntityPicker
          label="Stories"
          items={options}
          selected={selected}
          onChange={setSelected}
          onSearch={setSearch}
          itemLabel={(s) => s.title}
        >
          {(story) => <StoryOption story={story} />}
        </EntityPicker>
      ) : (
        <>
          {kind === "resource" ? (
            <SelectField
              label="Resource source"
              value={mode}
              options={[
                { value: "new", label: "New reference" },
                { value: "existing", label: "Existing shared resource" },
              ]}
              onChange={setMode}
            />
          ) : null}
          {mode === "existing" && kind === "resource" ? (
            <EntityPicker
              label="Existing resources"
              items={available.data?.resources || []}
              selected={resources}
              onChange={setResources}
              onSearch={setSearch}
              itemLabel={(r) => r.label}
            >
              {(r) => (
                <>
                  {r.label} · {r.kind}
                </>
              )}
            </EntityPicker>
          ) : (
            <>
              <TextField
                label={kind === "interview" ? "Interviewee / source" : "Label"}
                value={title}
                onChange={setTitle}
                maxLength={kind === "interview" ? 240 : 120}
                autoFocus
                error={attempted && !title.trim() ? "Add a name." : undefined}
              />
              {kind === "resource" ? (
                <>
                  <TextField
                    label="URL"
                    type="url"
                    value={url}
                    onChange={setUrl}
                    maxLength={2048}
                    placeholder="https://…"
                  />
                  {mediaLibraryAvailable() ? (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={async () => {
                        setMediaOpen(true);
                        try {
                          const files = await pickFromMediaLibrary("other", {
                            title: "Choose a shared resource",
                            buttonLabel: "Use this resource",
                            multiple: false,
                          });
                          if (files[0]) {
                            setAttachment(files[0].id);
                            setTitle(files[0].title);
                          }
                        } finally {
                          setMediaOpen(false);
                        }
                      }}
                    >
                      Choose from Media Library{attachment ? " ✓" : ""}
                    </Button>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    References use the original file’s access permissions.
                  </p>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </WorkspaceDialog>
  );
}
