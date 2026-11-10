import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TextField, SelectField } from "@byline/newsroom-ui/components/form-fields";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import { DayRangeField } from "../workspace/fields";
import { describeEditorialError } from "../editorial/editorial-model";
import { collectionTypes, type Collection } from "./collection-model";
import type { CollectionApi } from "./collection-api";

/**
 * New collection, or Edit details. Creating asks only for a name and a type:
 * the Collection starts in Planning with its creator as lead, and its team,
 * dates, brief and public settings are filled in afterwards in the workspace.
 * Global Create and the Collections screen's New collection open this same
 * dialog through the host's one controller.
 */
export function CollectionDialog({
  api,
  open = true,
  onClose,
  onSaved,
  collection,
}: {
  api: CollectionApi;
  open?: boolean;
  onClose: () => void;
  onSaved: (collection: Collection) => void;
  collection?: Collection;
}) {
  const [name, setName] = useState(collection?.name || "");
  const [type, setType] = useState<Collection["type"] | "">(collection?.type || "");
  const [dates, setDates] = useState([collection?.startDate || "", collection?.endDate || ""]);
  const [attempted, setAttempted] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      collection
        ? api.update(collection.id, {
            name: name.trim(),
            type: type || collection.type,
            startDate: dates[0],
            endDate: dates[1],
          })
        : api.create({ name: name.trim(), type: type as Collection["type"] }),
    onSuccess: onSaved,
  });
  const valid = Boolean(name.trim()) && Boolean(type);
  return (
    <WorkspaceDialog
      open={open}
      title={collection ? "Edit collection" : "New collection"}
      description={
        collection
          ? "The Collection's name, type and dates. The team and brief are edited in the workspace."
          : "A shared desk for related reporting. Add the team, dates and brief once it's open."
      }
      submitLabel={collection ? "Save details" : "Create collection"}
      onClose={onClose}
      finalFocus={() => null}
      pending={save.isPending}
      error={save.isError ? describeEditorialError(save.error) : undefined}
      onSubmit={() => {
        setAttempted(true);
        if (valid) save.mutate();
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        maxLength={240}
        error={attempted && !name.trim() ? "Give the Collection a name." : undefined}
      />
      <SelectField
        label="Type"
        options={[
          ...(type ? [] : [{ value: "", label: "Choose a type…" }]),
          ...Object.entries(collectionTypes).map(([value, label]) => ({ value, label })),
        ]}
        value={type}
        onChange={(v) => setType(v as Collection["type"])}
        error={attempted && !type ? "Choose what kind of reporting this is." : undefined}
      />
      {collection ? (
        <DayRangeField
          label="Date / date range"
          start={dates[0]}
          end={dates[1]}
          onChange={(start, end) => setDates([start, end])}
        />
      ) : null}
    </WorkspaceDialog>
  );
}
