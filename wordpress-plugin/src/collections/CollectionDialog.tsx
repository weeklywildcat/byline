import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { TextField, SelectField } from "../admin-ui/components/form-fields";
import { AssigneePicker } from "../admin-ui/components/pickers";
import { Field, FieldLabel } from "../admin-ui/ui/field";
import { WorkspaceDialog } from "../workspace/dialog-shell";
import { DayRangeField } from "../workspace/fields";
import type { ContributorEntry } from "../editorial/editorial-model";
import { describeEditorialError } from "../editorial/editorial-model";
import { collectionTypes, type Collection } from "./collection-model";
import type { CollectionApi } from "./collection-api";
export function CollectionDialog({
  api,
  people,
  currentUserId,
  onClose,
  onSaved,
  collection,
}: {
  api: CollectionApi;
  people: ContributorEntry[];
  currentUserId: number;
  onClose: () => void;
  onSaved: (collection: Collection) => void;
  collection?: Collection;
}) {
  const [name, setName] = useState(collection?.name || "");
  const [type, setType] = useState<Collection["type"]>(
    collection?.type || "other",
  );
  const [lead, setLead] = useState<ContributorEntry | null>(
    people.find(
      (p) => Number(p.id) === (collection?.lead?.id ?? currentUserId),
    ) || null,
  );
  const [dates, setDates] = useState([
    collection?.startDate || "",
    collection?.endDate || "",
  ]);
  const [attempted, setAttempted] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.save(
        {
          name: name.trim(),
          type,
          leadId: Number(lead?.id) || 0,
          startDate: dates[0],
          endDate: dates[1],
        },
        collection?.id,
      ),
    onSuccess: onSaved,
  });
  return (
    <WorkspaceDialog
      open
      title={collection ? "Edit collection" : "New collection"}
      description="A shared desk for related reporting. Only a name is required."
      submitLabel={collection ? "Save details" : "Create collection"}
      onClose={onClose}
      finalFocus={() => null}
      pending={save.isPending}
      error={save.isError ? describeEditorialError(save.error) : undefined}
      onSubmit={() => {
        setAttempted(true);
        if (name.trim()) save.mutate();
      }}
    >
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        maxLength={240}
        autoFocus
        error={
          attempted && !name.trim() ? "Give the Collection a name." : undefined
        }
      />
      <SelectField
        label="Type"
        options={Object.entries(collectionTypes).map(([value, label]) => ({
          value,
          label,
        }))}
        value={type}
        onChange={(v) => setType(v as typeof type)}
      />
      <Field>
        <FieldLabel>Lead</FieldLabel>
        <AssigneePicker
          label="Lead"
          people={people}
          value={lead}
          onChange={setLead}
        />
      </Field>
      <DayRangeField
        label="Date / date range"
        start={dates[0]}
        end={dates[1]}
        onChange={(start, end) => setDates([start, end])}
      />
    </WorkspaceDialog>
  );
}
