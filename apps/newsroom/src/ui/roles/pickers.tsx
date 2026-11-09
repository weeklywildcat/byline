"use client";

import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxValue, useComboboxAnchor } from "@byline/newsroom-ui/ui/combobox";

export type Choice = { value: string; label: string; description?: string };

const labelOf = (choice: Choice) => choice.label;
const same = (a: Choice, b: Choice) => a.value === b.value;

function Row({ choice }: { choice: Choice }) {
  return (
    <ComboboxItem value={choice}>
      <span className="flex min-w-0 flex-col">
        <span className="truncate">{choice.label}</span>
        {choice.description ? <span className="truncate text-xs text-muted-foreground">{choice.description}</span> : null}
      </span>
    </ComboboxItem>
  );
}

/** A searchable single choice. The label is the visible field label; `id` ties it to a Field. */
export function ChoiceCombobox({ id, choices, value, onChange, placeholder, emptyText = "Nothing found.", disabled, invalid }: {
  id: string;
  choices: Choice[];
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const selected = choices.find((choice) => choice.value === value) ?? null;
  return (
    <Combobox items={choices} value={selected} onValueChange={(next: Choice | null) => onChange(next?.value ?? null)} itemToStringLabel={labelOf} isItemEqualToValue={same} disabled={disabled}>
      <ComboboxInput id={id} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined} />
      <ComboboxContent>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>{(choice: Choice) => <Row key={choice.value} choice={choice} />}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** A searchable multiple choice, as removable chips. */
export function ChoicesCombobox({ id, choices, value, onChange, placeholder, emptyText = "Nothing found.", disabled }: {
  id: string;
  choices: Choice[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const anchor = useComboboxAnchor();
  const selected = value.map((entry) => choices.find((choice) => choice.value === entry)).filter((choice): choice is Choice => Boolean(choice));
  return (
    <Combobox multiple items={choices} value={selected} onValueChange={(next: Choice[]) => onChange(next.map((choice) => choice.value))} itemToStringLabel={labelOf} isItemEqualToValue={same} disabled={disabled}>
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(chosen: Choice[]) => (
            <>
              {chosen.map((choice) => <ComboboxChip key={choice.value}>{choice.label}</ComboboxChip>)}
              <ComboboxChipsInput id={id} placeholder={chosen.length ? "" : placeholder} disabled={disabled} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>{(choice: Choice) => <Row key={choice.value} choice={choice} />}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
