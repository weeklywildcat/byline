import apiFetch from "@wordpress/api-fetch";
import { Button, ComboboxControl, SelectControl, TextControl } from "@wordpress/components";
import { useEffect, useState } from "@wordpress/element";
import type { CustomField } from "@puckeditor/core";

type PickerOption = { label: string; value: string };
type EntityPickerProps = {
  value: string | number | undefined;
  onChange: (value: string | number) => void;
  readOnly?: boolean;
  label: string;
  path: string;
  mapItems: (response: unknown) => PickerOption[];
};

function EntityPicker({ value, onChange, readOnly, label, path, mapItems }: EntityPickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PickerOption[]>([]);

  useEffect(() => {
    let active = true;
    const separator = path.includes("?") ? "&" : "?";
    apiFetch({ path: `${path}${separator}search=${encodeURIComponent(query)}` })
      .then((response) => { if (active) setOptions(mapItems(response)); })
      .catch(() => { if (active) setOptions([]); });
    return () => { active = false; };
  }, [mapItems, path, query]);

  return (
    <ComboboxControl
      label={label}
      value={String(value ?? "")}
      options={options}
      onFilterValueChange={setQuery}
      onChange={(nextValue) => {
        if (!readOnly) onChange(nextValue && /^\d+$/.test(nextValue) ? Number(nextValue) : nextValue || "");
      }}
    />
  );
}

function wpEntities(response: unknown): PickerOption[] {
  return Array.isArray(response) ? response.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entity = item as Record<string, unknown>;
    const rendered = entity.title && typeof entity.title === "object"
      ? (entity.title as Record<string, unknown>).rendered
      : undefined;
    const label = typeof entity.name === "string" ? entity.name : typeof rendered === "string" ? rendered : "";
    return label && (typeof entity.id === "number" || typeof entity.id === "string")
      ? [{ label, value: String(entity.id) }]
      : [];
  }) : [];
}

function entityField(label: string, path: string, mapItems = wpEntities): CustomField<string | number> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => (
      <EntityPicker value={value} onChange={onChange} readOnly={readOnly} label={label} path={path} mapItems={mapItems} />
    )
  };
}

export function StoryPickerField() {
  return entityField("Story", "/wp/v2/posts?per_page=20&_fields=id,title");
}

export function SectionPickerField() {
  return entityField("Section", "/wp/v2/categories?per_page=50&_fields=id,name");
}

export function TagPickerField() {
  return entityField("Tag", "/wp/v2/tags?per_page=50&_fields=id,name");
}

export function AuthorPickerField() {
  return entityField("Author", "/wp/v2/users?per_page=50&_fields=id,name");
}

export function PagePickerField() {
  return entityField("Page", "/wp/v2/pages?per_page=20&_fields=id,title");
}

export function SportsTeamPickerField() {
  return entityField("Sports team", "/byline/v1/sports/teams", (response) => {
    const items = Array.isArray(response) ? response : response && typeof response === "object" && Array.isArray((response as Record<string, unknown>).teams)
      ? (response as { teams: unknown[] }).teams
      : [];
    return items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const team = item as Record<string, unknown>;
      if (team.active === false) return [];
      const value = team.id ?? team.key ?? team.slug;
      const label = team.displayName ?? team.name ?? team.label;
      return (typeof value === "string" || typeof value === "number") && typeof label === "string"
        ? [{ value: String(value), label }]
        : [];
    });
  });
}

export function NavigationPickerField(): CustomField<string> {
  return entityField("Navigation destination", "/byline/v1/publication", (response) => {
    if (!response || typeof response !== "object" || !Array.isArray((response as Record<string, unknown>).navigation)) return [];
    return ((response as { navigation: unknown[] }).navigation).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const link = item as Record<string, unknown>;
      return typeof link.label === "string" && typeof link.url === "string"
        ? [{ label: link.label, value: link.url }]
        : [];
    });
  }) as CustomField<string>;
}

export function MediaPickerField(): CustomField<number> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => (
      <div className="byline-studio-media-field">
        <span>{value ? `Media attachment ${value}` : "No image selected"}</span>
        <Button variant="secondary" disabled={readOnly || !window.wp?.media} onClick={() => {
          const frame = window.wp?.media({ title: "Choose publication media", multiple: false, library: { type: "image" } });
          if (!frame) return;
          frame.on("select", () => {
            const id = frame.state().get("selection").first().get("id");
            if (typeof id === "number") onChange(id);
          });
          frame.open();
        }}>Choose from Media Library</Button>
      </div>
    )
  };
}

export function FocalPointField(): CustomField<{ x: number; y: number }> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => {
      const point = value && typeof value === "object" ? value : { x: 50, y: 50 };
      return (
        <fieldset className="byline-studio-focal-field">
          <legend>Focal point</legend>
          {(["x", "y"] as const).map((axis) => (
            <label key={axis}>{axis.toUpperCase()}
              <input type="range" min="0" max="100" step="1" disabled={readOnly} value={point[axis]} onChange={(event) => onChange({ ...point, [axis]: Number(event.target.value) })} />
              <span>{point[axis]}%</span>
            </label>
          ))}
        </fieldset>
      );
    }
  };
}

export type StorySource =
  | { type: "latest" | "sticky"; limit: number }
  | { type: "category"; categoryId: number; limit: number }
  | { type: "tag"; tagId: number; limit: number }
  | { type: "author"; authorId: number; limit: number }
  | { type: "manual"; postIds: number[] };

export function StorySourceField(): CustomField<StorySource> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => {
      const source = value && typeof value === "object" ? value : { type: "latest" as const, limit: 5 };
      const type = source.type;
      const updateType = (nextType: StorySource["type"]) => {
        if (nextType === "manual") onChange({ type: "manual", postIds: [] });
        else if (nextType === "category") onChange({ type: "category", categoryId: 1, limit: 5 });
        else if (nextType === "tag") onChange({ type: "tag", tagId: 1, limit: 5 });
        else if (nextType === "author") onChange({ type: "author", authorId: 1, limit: 5 });
        else onChange({ type: nextType, limit: 5 });
      };

      return (
        <div className="byline-story-source-field">
          <SelectControl
            label="Story source"
            value={type}
            disabled={readOnly}
            options={[
              { label: "Latest", value: "latest" }, { label: "Sticky", value: "sticky" },
              { label: "Section", value: "category" }, { label: "Tag", value: "tag" },
              { label: "Author", value: "author" }, { label: "Manual story IDs", value: "manual" }
            ]}
            onChange={(nextType) => updateType(nextType as StorySource["type"])}
          />
          {type === "category" ? <EntityPicker value={source.categoryId} onChange={(categoryId) => onChange({ ...source, categoryId: Number(categoryId) })} readOnly={readOnly} label="Section" path="/wp/v2/categories?per_page=50&_fields=id,name" mapItems={wpEntities} /> : null}
          {type === "tag" ? <EntityPicker value={source.tagId} onChange={(tagId) => onChange({ ...source, tagId: Number(tagId) })} readOnly={readOnly} label="Tag" path="/wp/v2/tags?per_page=50&_fields=id,name" mapItems={wpEntities} /> : null}
          {type === "author" ? <EntityPicker value={source.authorId} onChange={(authorId) => onChange({ ...source, authorId: Number(authorId) })} readOnly={readOnly} label="Author" path="/wp/v2/users?per_page=50&_fields=id,name" mapItems={wpEntities} /> : null}
          {type === "manual" ? <TextControl label="WordPress story IDs" help="Comma-separated IDs in priority order." value={source.postIds.join(", ")} disabled={readOnly} onChange={(ids) => onChange({ type: "manual", postIds: ids.split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0) })} /> : (
            <TextControl label="Maximum stories" type="number" value={String(source.limit)} disabled={readOnly} onChange={(limit) => onChange({ ...source, limit: Math.max(1, Math.min(50, Number(limit) || 1)) })} />
          )}
        </div>
      );
    }
  };
}
