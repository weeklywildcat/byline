/**
 * A RadioGroup of shadcn choice cards: each option is a bordered FieldLabel
 * around a horizontal Field with its own title and, optionally, a sentence
 * saying what choosing it means. The radio is named by its title alone, so
 * "Guest contributor" stays "Guest contributor" to assistive technology and
 * tests; the sentence is its description.
 */
import { useId, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "../ui/field";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export type ChoiceCard<T extends string> = { value: T; title: ReactNode; description?: ReactNode; disabled?: boolean };

export function ChoiceCards<T extends string>({ value, onChange, options, label, disabled, className }: {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<ChoiceCard<T>>;
  /** The group's accessible name, when no FieldLegend names it. */
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <RadioGroup value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled} aria-label={label} className={cn("gap-2", className)}>
      {options.map((option) => {
        const key = `${id}-${option.value}`;
        return (
          <FieldLabel key={option.value} htmlFor={key}>
            <Field orientation="horizontal" data-disabled={disabled || option.disabled ? true : undefined}>
              <FieldContent>
                <FieldTitle id={`${key}-title`}>{option.title}</FieldTitle>
                {option.description ? <FieldDescription id={`${key}-help`}>{option.description}</FieldDescription> : null}
              </FieldContent>
              <RadioGroupItem id={key} value={option.value} disabled={option.disabled} aria-labelledby={`${key}-title`} aria-describedby={option.description ? `${key}-help` : undefined} />
            </Field>
          </FieldLabel>
        );
      })}
    </RadioGroup>
  );
}
