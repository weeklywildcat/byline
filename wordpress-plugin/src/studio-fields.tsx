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

// --- schema v2 fields -------------------------------------------------------

// The v2 story source, in newsroom language. Two differences from the v1 field
// above: "how many" belongs to the package rather than the source, and manual
// selection uses the searchable story picker instead of asking an editor to
// type WordPress post IDs.
export type LeadStorySource =
  | { type: "latest" }
  | { type: "sticky" }
  | { type: "category"; categoryId: number }
  | { type: "tag"; tagId: number }
  | { type: "author"; authorId: number }
  | { type: "manual"; storyIds: number[] };

function ManualStoryList({
  storyIds,
  onChange,
  readOnly
}: {
  storyIds: number[];
  onChange: (storyIds: number[]) => void;
  readOnly?: boolean;
}) {
  const [labels, setLabels] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;
    const missing = storyIds.filter((id) => !labels[id]);

    if (!missing.length) return () => undefined;

    apiFetch<Array<{ id: number; title?: { rendered?: string } }>>({
      path: `/wp/v2/posts?include=${missing.join(",")}&_fields=id,title&per_page=${missing.length}`
    })
      .then((posts) => {
        if (!active) return;
        setLabels((current) => ({
          ...current,
          ...Object.fromEntries(posts.map((post) => [post.id, post.title?.rendered ?? `Story ${post.id}`]))
        }));
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [labels, storyIds]);

  return (
    <div className="byline-manual-story-list">
      {storyIds.length ? (
        <ol>
          {storyIds.map((id, index) => (
            <li key={id}>
              <span dangerouslySetInnerHTML={{ __html: labels[id] ?? `Story ${id}` }} />
              <span className="byline-manual-story-actions">
                <Button
                  size="small"
                  variant="tertiary"
                  disabled={readOnly || index === 0}
                  onClick={() => {
                    const next = [...storyIds];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    onChange(next);
                  }}
                >
                  Move up
                </Button>
                <Button
                  size="small"
                  variant="tertiary"
                  isDestructive
                  disabled={readOnly}
                  onClick={() => onChange(storyIds.filter((entry) => entry !== id))}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="byline-manual-story-empty">No stories chosen yet. Search below to add one.</p>
      )}
      <EntityPicker
        value=""
        onChange={(next) => {
          const id = Number(next);
          if (!readOnly && Number.isInteger(id) && id > 0 && !storyIds.includes(id)) onChange([...storyIds, id]);
        }}
        readOnly={readOnly}
        label="Add a story"
        path="/wp/v2/posts?per_page=20&_fields=id,title"
        mapItems={wpEntities}
      />
    </div>
  );
}

export function LeadStorySourceField(label: string): CustomField<LeadStorySource> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => {
      const source: LeadStorySource = value && typeof value === "object" ? value : { type: "latest" };

      const updateType = (nextType: LeadStorySource["type"]) => {
        if (nextType === "manual") onChange({ type: "manual", storyIds: [] });
        else if (nextType === "category") onChange({ type: "category", categoryId: 1 });
        else if (nextType === "tag") onChange({ type: "tag", tagId: 1 });
        else if (nextType === "author") onChange({ type: "author", authorId: 1 });
        else onChange({ type: nextType });
      };

      return (
        <div className="byline-story-source-field">
          <SelectControl
            label={label}
            value={source.type}
            disabled={readOnly}
            options={[
              { label: "Automatic — newest first", value: "latest" },
              { label: "Automatic — featured first", value: "sticky" },
              { label: "From a section", value: "category" },
              { label: "From a tag", value: "tag" },
              { label: "By a writer", value: "author" },
              { label: "Chosen by hand", value: "manual" }
            ]}
            onChange={(nextType) => updateType(nextType as LeadStorySource["type"])}
          />
          {source.type === "category" ? (
            <EntityPicker
              value={source.categoryId}
              onChange={(categoryId) => onChange({ type: "category", categoryId: Number(categoryId) })}
              readOnly={readOnly}
              label="Section"
              path="/wp/v2/categories?per_page=50&_fields=id,name"
              mapItems={wpEntities}
            />
          ) : null}
          {source.type === "tag" ? (
            <EntityPicker
              value={source.tagId}
              onChange={(tagId) => onChange({ type: "tag", tagId: Number(tagId) })}
              readOnly={readOnly}
              label="Tag"
              path="/wp/v2/tags?per_page=50&_fields=id,name"
              mapItems={wpEntities}
            />
          ) : null}
          {source.type === "author" ? (
            <EntityPicker
              value={source.authorId}
              onChange={(authorId) => onChange({ type: "author", authorId: Number(authorId) })}
              readOnly={readOnly}
              label="Writer"
              path="/wp/v2/users?per_page=50&_fields=id,name"
              mapItems={wpEntities}
            />
          ) : null}
          {source.type === "manual" ? (
            <ManualStoryList
              storyIds={source.storyIds}
              readOnly={readOnly}
              onChange={(storyIds) => onChange({ type: "manual", storyIds })}
            />
          ) : null}
        </div>
      );
    }
  };
}

// The athlete spotlight's source, in newsroom language.
//
// The package deliberately supports only two answers -- the standing spotlight
// convention, or a story chosen by hand -- so the field offers exactly those
// rather than the general story-source picker.
export type AthleteSpotlightSourceValue = { type: "athlete-spotlight" } | { type: "manual"; storyIds: number[] };

export function AthleteSpotlightSourceField(label: string): CustomField<AthleteSpotlightSourceValue> {
  return {
    type: "custom",
    render: ({ value, onChange, readOnly }) => {
      const source: AthleteSpotlightSourceValue =
        value && typeof value === "object" && value.type === "manual" ? value : { type: "athlete-spotlight" };

      return (
        <div className="byline-story-source-field">
          <SelectControl
            label={label}
            value={source.type}
            disabled={readOnly}
            options={[
              { label: "Whoever is flagged this week", value: "athlete-spotlight" },
              { label: "Chosen by hand", value: "manual" }
            ]}
            onChange={(nextType) =>
              onChange(nextType === "manual" ? { type: "manual", storyIds: [] } : { type: "athlete-spotlight" })
            }
          />
          {source.type === "manual" ? (
            <ManualStoryList
              storyIds={source.storyIds}
              readOnly={readOnly}
              onChange={(storyIds) => onChange({ type: "manual", storyIds })}
            />
          ) : null}
        </div>
      );
    }
  };
}
