/**
 * Thin Byline wrappers over shadcn Field: each one gets an id, wires the label,
 * hint and error to the control, and nothing else. Layout and styling belong to
 * Field, FieldGroup and the controls themselves.
 */
import { useId, type ComponentProps, type ReactNode } from "react";
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

/**
 * The attributes Safari and iOS read to choose the keyboard, autocorrection,
 * capitalization and AutoFill. They are an allowlist: callers cannot reach the
 * wiring FormField owns (id, label, aria-invalid, aria-describedby).
 */
export type InputSemantics = Pick<ComponentProps<"input">, "inputMode" | "autoComplete" | "autoCapitalize" | "autoCorrect" | "spellCheck" | "enterKeyHint">;

/** A web address someone else owns: URL keyboard, never capitalized, corrected or spell-checked. */
export const URL_INPUT = { type: "url", inputMode: "url", autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const satisfies InputSemantics & { type: string };
/** A slug or other machine identifier. */
export const IDENTIFIER_INPUT = { autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const satisfies InputSemantics;
/** Someone else's email address (not the signed-in user's): email keyboard, no capitalization or correction, no AutoFill identity. */
export const EMAIL_INPUT = { type: "email", inputMode: "email", autoComplete: "off", autoCapitalize: "none", autoCorrect: "off", spellCheck: false } as const satisfies InputSemantics & { type: string };
/** A phone number someone else owns. */
export const PHONE_INPUT = { type: "tel", inputMode: "tel", autoComplete: "off" } as const satisfies InputSemantics & { type: string };

export function TextField({ label, value, onChange, error, hint, optional, maxLength, autoFocus, disabled, placeholder, name, type, inputMode, autoComplete, autoCapitalize, autoCorrect, spellCheck, enterKeyHint }: FieldChrome & InputSemantics & { value: string; onChange: (value: string) => void; maxLength?: number; autoFocus?: boolean; disabled?: boolean; placeholder?: string; name?: string; type?: string }) {
  const id = useId();
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Input id={id} name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} autoFocus={autoFocus} disabled={disabled} placeholder={placeholder} inputMode={inputMode} autoComplete={autoComplete} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} spellCheck={spellCheck} enterKeyHint={enterKeyHint} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint)} />
  </FormField>;
}

export function TextAreaField({ label, value, onChange, error, hint, optional, maxLength, rows = 3, disabled, autoFocus, autoCapitalize, autoCorrect, spellCheck, enterKeyHint }: FieldChrome & Pick<InputSemantics, "autoCapitalize" | "autoCorrect" | "spellCheck" | "enterKeyHint"> & { value: string; onChange: (value: string) => void; maxLength: number; rows?: number; disabled?: boolean; autoFocus?: boolean }) {
  const id = useId();
  const count = value.length > maxLength * 0.85 ? <span aria-live="polite" className="tabular-nums">{value.length}/{maxLength}</span> : null;
  return <FormField id={id} label={label} error={error} hint={hint && count ? <>{hint} {count}</> : hint ?? count} optional={optional}>
    <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={rows} disabled={disabled} autoFocus={autoFocus} autoCapitalize={autoCapitalize} autoCorrect={autoCorrect} spellCheck={spellCheck} enterKeyHint={enterKeyHint} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, error, hint ?? count)} />
  </FormField>;
}

export function SelectField<T extends string>({ label, value, options, onChange, disabled, error, hint, optional }: FieldChrome & { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (value: T) => void; disabled?: boolean }) {
  const id = useId();
  return <FormField id={id} label={label} error={error} hint={hint} optional={optional}>
    <Select items={options} value={value} disabled={disabled} onValueChange={(next) => { if (next) onChange(next as T); }}>
      <SelectTrigger id={id} className="w-full" aria-invalid={error ? true : undefined}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </FormField>;
}
