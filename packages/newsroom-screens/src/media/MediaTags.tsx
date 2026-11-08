import { cn } from "@byline/newsroom-ui/lib/utils";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, useComboboxAnchor } from "@byline/newsroom-ui/ui/combobox";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MEDIA_TAGS_MAX, normalizeMediaTags, type MediaTagCount } from "./media-library-model";

/**
 * Tags as chips: type to find a tag already in use and press Enter, or type
 * a new one and press a comma (or choose “Add”); Backspace or a chip's × removes one. Every
 * tag is normalized as it is added (lowercase, one spelling).
 */
export function MediaTagInput({ id, value, onChange, suggestions = [], disabled, readOnly, placeholder = "Add tags…", "aria-label": ariaLabel }: { id?: string; value: string[]; onChange: (tags: string[]) => void; suggestions?: readonly MediaTagCount[]; disabled?: boolean; readOnly?: boolean; placeholder?: string; "aria-label"?: string }) {
  const anchor = useComboboxAnchor();
  const [query, setQuery] = useState("");
  const typed = normalizeMediaTags([query])[0] ?? "";
  const known = useMemo(() => suggestions.map((item) => item.tag), [suggestions]);
  const counts = useMemo(() => new Map(suggestions.map((item) => [item.tag, item.count])), [suggestions]);
  // Tags in use first (reusing one beats a near-duplicate; the combobox filters them by what's typed), then the typed tag when it's new.
  const items = useMemo(() => [...known, ...(typed && !known.includes(typed) && !value.includes(typed) ? [typed] : [])], [known, typed, value]);
  const full = value.length >= MEDIA_TAGS_MAX;
  const commit = (next: string[]) => {
    onChange(normalizeMediaTags(next));
    setQuery("");
  };

  if (readOnly) {
    return value.length ? <div className="flex flex-wrap gap-1" data-media-tags="">{value.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div> : <p className="py-1.5 text-sm text-muted-foreground">No tags</p>;
  }
  return (
    <Combobox multiple items={items} value={value} onValueChange={(next: string[]) => { if (next.length <= MEDIA_TAGS_MAX) commit(next); }} inputValue={query} onInputValueChange={setQuery} autoHighlight disabled={disabled}>
      <ComboboxChips ref={anchor} data-media-tags="">
        {value.map((tag) => <ComboboxChip key={tag} aria-label={`Remove tag ${tag}`}><span>{tag}</span></ComboboxChip>)}
        <ComboboxChipsInput
          id={id}
          aria-label={ariaLabel}
          placeholder={value.length ? (full ? "" : "Add…") : placeholder}
          disabled={disabled || full}
          onKeyDown={(event) => {
            // A comma ends a tag, like Enter.
            if (event.key === "," && typed) {
              event.preventDefault();
              commit([...value, typed]);
            }
          }}
          data-media-tag-input=""
        />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Type a tag and press Enter.</ComboboxEmpty>
        <ComboboxList>
          {(tag: string) => (
            <ComboboxItem key={tag} value={tag}>
              {tag === typed && !known.includes(tag) ? <><Plus aria-hidden="true" className="text-muted-foreground" />Add “{tag}”</> : <><span className="flex-1">{tag}</span><span className="text-xs text-muted-foreground tabular-nums">{counts.get(tag)}</span></>}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/** One tag to filter the Library by, from the tags in use. */
export function MediaTagFilter({ value, onChange, tags, className }: { value: string; onChange: (tag: string) => void; tags: readonly MediaTagCount[]; className?: string }) {
  const items = useMemo(() => tags.map((item) => item.tag), [tags]);
  const counts = useMemo(() => new Map(tags.map((item) => [item.tag, item.count])), [tags]);
  return (
    <Combobox items={items} value={value || null} onValueChange={(next: string | null) => onChange(next ?? "")} autoHighlight>
      <ComboboxInput aria-label="Tag" placeholder={items.length ? "Any tag" : "No tags yet"} showClear={Boolean(value)} disabled={!items.length} className={cn("w-full", className)} />
      <ComboboxContent>
        <ComboboxEmpty>No tag matches.</ComboboxEmpty>
        <ComboboxList>{(tag: string) => <ComboboxItem key={tag} value={tag}><span className="flex-1">{tag}</span><span className="text-xs text-muted-foreground tabular-nums">{counts.get(tag)}</span></ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
