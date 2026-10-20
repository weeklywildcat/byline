/**
 * Thin Byline wrappers over shadcn Field: each one gets an id, wires the label,
 * hint and error to the control, and nothing else. Layout and styling belong to
 * Field, FieldGroup and the controls themselves.
 */
import { useId, type ReactNode } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

export type FieldChrome = { label: string; error?: string; hint?: ReactNode; optional?: boolean };

export function FormField({ id, label, error, hint, optional, children }: FieldChrome & { id: string; children: ReactNode }) {
  return <Field data-invalid={error ? "true" : undefined}>
    <FieldLabel htmlFor={id}>{label}{optional ? <span className="font-normal text-muted-foreground">Optional</span> : null}</FieldLabel>
    {children}
    {hint && !error ? <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription> : null}
    {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
  </Field>;
}

export const describedBy = (id: string, error?: string, hint?: ReactNode) => (error ? `${id}-error` : hint ? `${id}-hint` : undefined);

export function TextField({ label, value, onChange, error, hint, optional, maxLength, autoFocus, disabled, placeholder, name, type }: FieldChrome & { value: string; onChange: (value: string) => void; maxLength?: number; autoFocus?: boolean; disabled?: boolean; placeholder?: string; name?: string; type?: string }) {
  const id = useId();
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Input id={id} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} autoFocus={autoFocus} disabled={disabled} placeholder={placeholder} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />
  </FormField>;
}

export function TextAreaField({ label, value, onChange, error, hint, optional, maxLength, rows = 3, disabled, autoFocus }: FieldChrome & { value: string; onChange: (value: string) => void; maxLength: number; rows?: number; disabled?: boolean; autoFocus?: boolean }) {
  const id = useId();
  const count = value.length > maxLength * 0.85 ? <span aria-live="polite" className="tabular-nums">{value.length}/{maxLength}</span> : null;
  return <FormField id={id} label={label} error={error} hint={hint && count ? <>{hint} {count}</> : hint ?? count} optional={optional}>
    <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={rows} disabled={disabled} autoFocus={autoFocus} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint ?? count)} />
  </FormField>;
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled, error, hint, optional }: FieldChrome & { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  const id = useId();
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Select items={options} value={value} disabled={disabled} onValueChange={(next) => { if (next) onChange(next as T); }}>
      <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </FormField>;
}

export function TimeField({ label, value, onChange, error, disabled, optional }: FieldChrome & { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <FormField id={id} label={label} error={error} optional={optional}>
    <Input id={id} type="time" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error)} />
  </FormField>;
}
