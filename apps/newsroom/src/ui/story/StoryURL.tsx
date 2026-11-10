"use client";

import { publicStoryPath, publicationLocalDateTime } from "@byline/content";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { DialogRoot as Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@byline/newsroom-ui/ui/adaptive-dialog";
import { DateTimeField } from "@byline/newsroom-ui/components/date-fields";
import { TextField } from "@byline/newsroom-ui/components/form-fields";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { localToInstant } from "../../domain/dates";
import { isSlug, slugify } from "../../domain/slug";
import type { StoryURLContext } from "../../newsroom/story-url";
import { getJson } from "./api";
import { relationIdOf, useStoryField } from "./form";
import type { StoryScreenContext } from "./StoryScreen";

export function useStoryURL(context: StoryScreenContext) {
  const slug = useStoryField<string>("slug");
  const date = useStoryField<string | null>("publishedAt");
  const section = useStoryField<unknown>("section");
  const result = useQuery({
    queryKey: ["story-public-url", context.storyId],
    queryFn: () => getJson<StoryURLContext>(context.api, `/byline/stories/${context.storyId}/public-url`),
    enabled: context.storyId != null
  });
  const config = result.data;
  const currentSection = config?.sections.find((item) => String(item.id) === String(relationIdOf(section.value)));
  const proposedPath = (proposedSlug = slug.value, proposedDate = date.value) => config ? publicStoryPath({
    slug: slugify(proposedSlug), publishedAt: proposedDate,
    sectionSlug: currentSection?.hidden ? null : currentSection?.slug, timeZone: config.timezone
  }) : "";
  return { config, result, slug, date, currentSection, proposedPath };
}

export function StoryURL({ context, compact = false }: { context: StoryScreenContext; compact?: boolean }) {
  const { config, result, slug, date, currentSection, proposedPath } = useStoryURL(context);
  const [open, setOpen] = useState(false);
  const [nextSlug, setNextSlug] = useState("");
  const [wallTime, setWallTime] = useState("");
  const [error, setError] = useState("");
  const sectionControl = useRef<HTMLElement | null>(null);
  const editDate = context.role === "editor" || context.role === "administrator";
  if (!config) return result.isError ? <p role="status" className="text-sm text-muted-foreground">The public URL could not be loaded.</p> : null;
  const url = config.path ? config.publicSite + config.path : "";
  const pending = proposedPath();
  const partial = currentSection && slug.value ? `…/${currentSection.slug}/${slug.value}/` : "";
  const originalTime = date.value ? publicationLocalDateTime(date.value, config.timezone) : "";
  function save(event: FormEvent) {
    event.preventDefault();
    const normalized = slugify(nextSlug);
    if (!isSlug(normalized)) return setError("Enter a slug using letters, numbers and hyphens.");
    if (editDate && wallTime !== originalTime) {
      if (!wallTime && date.value) return setError("Enter a publication date to replace the existing date.");
      if (wallTime) {
        try {
          const timezone = config!.timezone;
          const instant = localToInstant(wallTime, timezone);
          if (!publicationLocalDateTime(instant, timezone).startsWith(wallTime)) throw new Error();
          date.setValue(instant);
        } catch {
          return setError("Enter a date and time that exists in the publication timezone.");
        }
      }
    }
    slug.setValue(normalized);
    setOpen(false);
  }
  return <section aria-label="Public URL" className={compact ? "flex flex-col gap-2 text-sm" : "flex flex-col gap-1 border-t border-border pt-2 text-sm"}>
    <p className="text-muted-foreground [overflow-wrap:anywhere]">
      <span className="font-medium text-foreground">Public URL: </span>
      {config.path || pending || partial || "Choose a section and slug to see the path."}
      {!config.path && !date.value ? " The date is assigned on first publication." : ""}
      {currentSection?.hidden ? " This section is internal." : ""}
    </p>
    {config.path && pending && config.path !== pending ? <p className="text-muted-foreground [overflow-wrap:anywhere]">After publishing changes: {pending}</p> : null}
    {slug.error ? <p role="alert" className="text-destructive">{slug.error}</p> : null}
    {date.error ? <p role="alert" className="text-destructive">{date.error}</p> : null}
    <div className="flex flex-wrap gap-1">
      {url ? <>
        <Button type="button" size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success("Public URL copied."), () => toast.error("The URL could not be copied."))}>Copy URL</Button>
        <a className={buttonVariants({ size: "sm", variant: "outline" })} href={url} target="_blank" rel="noreferrer">Open published story</a>
      </> : null}
      {!context.readOnly ? <Dialog open={open} onOpenChange={(next) => {
        if (next) { setNextSlug(slug.value ?? ""); setWallTime(originalTime); setError(""); sectionControl.current = null; }
        setOpen(next);
      }}>
        <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>Edit URL</DialogTrigger>
        <DialogContent finalFocus={() => sectionControl.current ?? true} className="max-h-[calc(100dvh-2rem)] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit public URL</DialogTitle>
            <DialogDescription>{config.path ? "Changes to the address take effect when you publish the story." : "The story's section, slug and first publication date determine its address."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="grid gap-4">
            <FieldGroup>
              <TextField label="Story slug" value={nextSlug} onChange={setNextSlug} maxLength={120} hint="Lowercase letters, numbers and hyphens." />
              <Field>
                <FieldLabel>Section</FieldLabel>
                <p className="text-sm">{currentSection?.name ?? "None selected"}</p>
                {compact ? (
                  <FieldDescription>Change the Section in the story properties above the article.</FieldDescription>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => {
                    sectionControl.current = document.querySelector<HTMLElement>("#byline-story-section button");
                    setOpen(false);
                  }}>Go to Section field</Button>
                )}
              </Field>
              {editDate ? <DateTimeField label="First publication" value={wallTime} onChange={setWallTime} timeZone={config.timezone} seconds optional={!date.value} hint={!config.path && !date.value ? "Leave blank to use the actual time of first publication. For a migrated story, enter its original time." : undefined} /> : null}
            </FieldGroup>
            {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button type="submit">Apply to draft</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog> : null}
    </div>
  </section>;
}
