import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { TextField, SelectField, URL_INPUT } from "@byline/newsroom-ui/components/form-fields";
import { Button } from "@byline/newsroom-ui/ui/button";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import { useDebouncedValue } from "@byline/newsroom-ui/lib/hooks";
import { describeEditorialError } from "../editorial/editorial-model";
import { useCollectionHost } from "./collection-host";
import { edgeChanges, resourceKinds, type CollectionDetail, type ResourceInput, type SharedResource } from "./collection-model";
import { EntityPicker, StoryOption } from "./collection-ui";

/**
 * Adding to a Collection: existing stories (membership only, nothing moves
 * or is copied), a new shared interview, or a resource (a web link, a file
 * chosen from the host's Media, or a resource another Collection already
 * shares).
 */
export function CollectionAddDialog({
  kind,
  detail,
  onClose,
  onSaved,
}: {
  kind: "existing" | "interview" | "resource";
  detail: CollectionDetail;
  onClose: () => void;
  onSaved: (interviewId?: number) => Promise<unknown>;
}) {
  const host = useCollectionHost();
  const api = host.api;
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [resourceKind, setResourceKind] = useState<keyof typeof resourceKinds>("link");
  const [mode, setMode] = useState("new");
  const [file, setFile] = useState<{ id: number; title: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState(detail.stories);
  const [resources, setResources] = useState<SharedResource[]>([]);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search);
  const [attempted, setAttempted] = useState(false);
  const id = detail.collection.id;
  const stories = useQuery({
    queryKey: ["byline", "collection-story-options", debounced],
    queryFn: () => api.storyOptions(debounced),
    enabled: kind === "existing",
  });
  const available = useQuery({
    queryKey: ["byline", "collection-resource-options", debounced],
    queryFn: () => api.resourceOptions(debounced),
    enabled: kind === "resource" && mode === "existing",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (kind === "existing") {
        for (const change of edgeChanges(detail.collection.storyIds, selected.map((s) => s.id))) {
          await (change.linked ? api.addStory(id, change.target) : api.removeStory(id, change.target));
        }
      } else if (kind === "interview") return (await api.saveInterview(id, { interviewee: title.trim() })).id;
      else if (mode === "existing") {
        for (const resource of resources) await api.reuseResource(id, resource.id);
      } else {
        const input: ResourceInput = { label: title.trim(), kind: resourceKind, ...(url.trim() ? { url: url.trim() } : {}), ...(file ? { attachmentId: file.id } : {}) };
        await api.addResource(id, input);
      }
      return undefined;
    },
    onSuccess: onSaved,
  });
  const name = kind === "existing" ? "Add existing story" : kind === "interview" ? "New interview" : "Add resource";
  const options = [...new Map([...detail.stories, ...(stories.data?.stories || [])].map((s) => [s.id, s])).values()];
  const linked = new Set(detail.resources.map((r) => r.id));
  const valid =
    kind === "existing" ||
    (kind === "resource" && mode === "existing"
      ? resources.length > 0
      : Boolean(title.trim()) && (kind !== "resource" || Boolean(file) || /^https?:\/\/\S+$/.test(url.trim())));
  return (
    <WorkspaceDialog
      open
      title={name}
      description={kind === "existing" ? "Membership only: the stories don’t move and nothing is copied." : `Shared reporting for ${detail.collection.name}.`}
      submitLabel={kind === "existing" ? "Save stories" : name}
      onClose={onClose}
      finalFocus={() => null}
      modal={!picking}
      pending={save.isPending}
      error={
        save.isError
          ? describeEditorialError(save.error)
          : stories.isError || available.isError
          ? "The search could not be loaded. Try again."
          : attempted && !valid
          ? kind === "resource" && mode === "new" && title.trim()
            ? "Add a web address or choose a file."
            : "Complete the required fields."
          : undefined
      }
      onSubmit={() => {
        setAttempted(true);
        if (valid) save.mutate();
      }}
    >
      {kind === "existing" ? (
        <EntityPicker label="Stories" items={options} selected={selected} onChange={setSelected} onSearch={setSearch} itemLabel={(s) => s.title}>
          {(story) => <StoryOption story={story} />}
        </EntityPicker>
      ) : (
        <>
          {kind === "resource" ? (
            <SelectField
              label="Resource"
              value={mode}
              options={[
                { value: "new", label: "New link or file" },
                { value: "existing", label: "Reuse a shared resource" },
              ]}
              onChange={setMode}
            />
          ) : null}
          {mode === "existing" && kind === "resource" ? (
            <EntityPicker
              label="Shared resources"
              items={(available.data?.resources || []).filter((r) => !linked.has(r.id))}
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
                label={kind === "interview" ? "Interviewee / source" : "Name"}
                value={title}
                onChange={setTitle}
                maxLength={kind === "interview" ? 240 : 160}
                error={attempted && !title.trim() ? "Add a name." : undefined}
              />
              {kind === "resource" ? (
                <>
                  <SelectField
                    label="Kind"
                    value={resourceKind}
                    options={Object.entries(resourceKinds).map(([value, label]) => ({ value: value as keyof typeof resourceKinds, label }))}
                    onChange={setResourceKind}
                  />
                  <TextField label="Web address" {...URL_INPUT} value={url} onChange={setUrl} maxLength={2048} placeholder="https://…" optional={Boolean(file)} />
                  {host.media?.available() ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        type="button"
                        onClick={async () => {
                          setPicking(true);
                          try {
                            const files = await host.media!.pick("other", { title: "Choose a shared file", buttonLabel: "Use this file", multiple: false });
                            if (files[0]) {
                              setFile({ id: files[0].id, title: files[0].title });
                              if (!title.trim()) setTitle(files[0].title);
                            }
                          } finally {
                            setPicking(false);
                          }
                        }}
                      >
                        {file ? "Choose another file" : host.media.label}
                      </Button>
                      {file ? (
                        <span className="text-sm text-muted-foreground">
                          {file.title}{" "}
                          <Button variant="link" size="sm" type="button" className="h-auto px-1" onClick={() => setFile(null)}>
                            Remove
                          </Button>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">Files stay in Media with their own access; the resource only points to them.</p>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </WorkspaceDialog>
  );
}
