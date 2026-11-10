import type { DataValue, FieldDefinition } from "./fields";

/**
 * Reader- and newsroom-facing text for a stored value, in the publication's
 * locale and timezone (never the browser's). Shared by the newsroom grid and
 * every public presentation so a value reads the same everywhere.
 */
export type DataFormatOptions = { locale: string; timeZone: string };

const numberFormats = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, options: Intl.NumberFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(locale, options)));
  return format;
}

export function formatDataValue(field: FieldDefinition, value: DataValue, { locale, timeZone }: DataFormatOptions): string {
  if (value === null || value === "") return "";
  switch (field.type) {
    case "text":
    case "longText":
    case "url":
    case "relationship":
      return String(value);
    case "integer":
      return numberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value));
    case "number":
      return numberFormat(locale, field.options.decimals === undefined ? { maximumFractionDigits: 6 } : { minimumFractionDigits: field.options.decimals, maximumFractionDigits: field.options.decimals }).format(Number(value));
    case "percentage":
      return `${numberFormat(locale, field.options.decimals === undefined ? { maximumFractionDigits: 2 } : { minimumFractionDigits: field.options.decimals, maximumFractionDigits: field.options.decimals }).format(Number(value))}%`;
    case "currency": {
      // Intl formats from a string without passing through a float for the digits it shows.
      const format = numberFormat(locale, { style: "currency", currency: field.options.currency, minimumFractionDigits: field.options.scale, maximumFractionDigits: field.options.scale });
      return format.format(String(value) as unknown as number);
    }
    case "boolean":
      return value ? "Yes" : "No";
    case "date": {
      const [year, month, day] = String(value).split("-").map(Number);
      return new Intl.DateTimeFormat(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
    }
    case "dateTime":
      return new Intl.DateTimeFormat(locale, { timeZone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(String(value)));
    case "select":
      return field.options.choices.find((choice) => choice.value === value)?.label ?? String(value);
  }
}

/** The tone of a choice value, for presentations that show status. */
export function choiceTone(field: FieldDefinition | null | undefined, value: DataValue): string {
  if (!field || field.type !== "select") return "neutral";
  return field.options.choices.find((choice) => choice.value === value)?.tone ?? "neutral";
}

/** A machine-readable value for `<time dateTime>` / `<data value>`. */
export function machineValue(field: FieldDefinition, value: DataValue): string {
  return value === null ? "" : String(value);
}
