import type { ReactNode } from "react";
import { Alert, AlertDescription } from "../ui/alert";
import { Button as NovaButton } from "../ui/button";
import { Card as NovaCard, CardContent } from "../ui/card";
import { Field, FieldDescription, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { NativeSelect, NativeSelectOption } from "../ui/native-select";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Search } from "lucide-react";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { cn } from "../lib/utils";

type LegacyButtonVariant = "primary" | "secondary" | "tertiary" | "link";

export function Button({ variant = "secondary", isBusy, isDestructive, href, children, ...props }: {
  variant?: LegacyButtonVariant;
  isBusy?: boolean;
  isDestructive?: boolean;
  href?: string;
  children?: ReactNode;
  [key: string]: any;
}) {
  const novaVariant = isDestructive ? "destructive" : variant === "primary" ? "default" : variant === "secondary" ? "outline" : variant === "tertiary" ? "ghost" : "link";
  const content = <>{isBusy ? <Spinner data-icon="inline-start" /> : null}{children}</>;
  if (href) return <NovaButton variant={novaVariant} render={<a href={href} />} {...props}>{content}</NovaButton>;
  return <NovaButton variant={novaVariant} {...props}>{content}</NovaButton>;
}

export function Card({ className, children }: { className?: string; children?: ReactNode }) {
  return <NovaCard className={className}>{children}</NovaCard>;
}

export function CardBody({ className, children }: { className?: string; children?: ReactNode }) {
  return <CardContent className={className}>{children}</CardContent>;
}

export function Notice({ status = "info", children, className }: { status?: "info" | "warning" | "error" | "success"; isDismissible?: boolean; children?: ReactNode; className?: string }) {
  return <Alert variant={status === "error" ? "destructive" : "default"} className={cn(
    status === "warning" && "border-warning/30 bg-warning/10",
    status === "success" && "border-emerald-600/20 bg-emerald-500/5",
    className
  )}><AlertDescription className={cn(status === "warning" && "text-foreground", status === "success" && "text-foreground")}>{children}</AlertDescription></Alert>;
}

export function TextControl({ label, value, onChange, help, type = "text", ...props }: {
  label: ReactNode;
  value?: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  type?: string;
  [key: string]: any;
}) {
  return <Field>
    <FieldLabel>{label}</FieldLabel>
    <Input type={type} value={value ?? ""} onChange={(event) => onChange(event.target.value)} {...props} />
    {help ? <FieldDescription>{help}</FieldDescription> : null}
  </Field>;
}

export function TextareaControl({ label, value, onChange, help, rows = 4, ...props }: {
  label: ReactNode;
  value?: string;
  onChange: (value: string) => void;
  help?: ReactNode;
  rows?: number;
  [key: string]: any;
}) {
  return <Field>
    <FieldLabel>{label}</FieldLabel>
    <Textarea value={value ?? ""} rows={rows} onChange={(event) => onChange(event.target.value)} {...props} />
    {help ? <FieldDescription>{help}</FieldDescription> : null}
  </Field>;
}

export function SelectControl({ label, value, options, onChange, help, disabled, className }: {
  label: ReactNode;
  value?: string;
  options: Array<{ label: ReactNode; value: string }>;
  onChange: (value: string) => void;
  help?: ReactNode;
  disabled?: boolean;
  className?: string;
  __nextHasNoMarginBottom?: boolean;
}) {
  return <Field className={className}>
    <FieldLabel>{label}</FieldLabel>
    <NativeSelect className="w-full" value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
    </NativeSelect>
    {help ? <FieldDescription>{help}</FieldDescription> : null}
  </Field>;
}

export function ToggleControl({ label, checked, onChange, help, disabled }: {
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: ReactNode;
  disabled?: boolean;
}) {
  return <Field orientation="horizontal" className="items-start justify-between gap-4 rounded-lg border p-3">
    <div className="min-w-0">
      <FieldLabel className="font-medium">{label}</FieldLabel>
      {help ? <FieldDescription>{help}</FieldDescription> : null}
    </div>
    <Switch checked={checked} disabled={disabled} onCheckedChange={(next) => onChange(Boolean(next))} />
  </Field>;
}

export { Spinner };


export function SearchControl({ label, value, onChange, placeholder, className }: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return <Field className={className}>
    <FieldLabel className="sr-only">{label}</FieldLabel>
    <InputGroup>
      <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
      <InputGroupInput type="search" aria-label={label} value={value ?? ""} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </InputGroup>
  </Field>;
}

export function Placeholder({ label, instructions, children }: { label: string; instructions?: string; children?: ReactNode }) {
  return <Empty className="py-8">
    <EmptyHeader><EmptyTitle>{label}</EmptyTitle>{instructions ? <EmptyDescription>{instructions}</EmptyDescription> : null}</EmptyHeader>
    {children ? <EmptyContent>{children}</EmptyContent> : null}
  </Empty>;
}
