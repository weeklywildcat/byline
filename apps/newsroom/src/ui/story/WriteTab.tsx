"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@byline/newsroom-ui/ui/toggle-group";
import { parseYouTubeVideoId } from "@byline/core";
import { RenderFields } from "@payloadcms/ui";
import type { ClientField, SanitizedFieldPermissions } from "payload";
import type { KeyboardEvent } from "react";
import { IMMERSIVE_ALIGNMENT_OPTIONS, LIVE_COVERAGE_STATE_OPTIONS, STORY_FORMAT_OPTIONS, STORY_PRESENTATION_OPTIONS } from "../../domain/vocabulary";
import { BylineEditorHostProvider } from "@byline/editor/client";
import { ArticleCanvas } from "./ArticleCanvas";
import { useNewsroomEditorHost } from "./editor-host";
import { childField, relationIdOf, relationIdsOf, useStoryField } from "./form";
import { QuickCreateRelation } from "./QuickCreateRelation";
import { StoryURL } from "./StoryURL";
import { LeadImage } from "./LeadImage";
import { Property, SectionHeading } from "./parts";
import { MultiPicker, SinglePicker, useOptions } from "./RelationPickers";
import type { StoryScreenContext } from "./StoryScreen";
import type { Id } from "./types";

type ChildPaths = {
  fields: ClientField[];
  parentPath: string;
  parentSchemaPath: string;
  parentIndexPath: string;
  permissions: SanitizedFieldPermissions | Record<string, SanitizedFieldPermissions> | undefined;
};

/** Renders one story field with Payload's own component, for the one input Payload must own: the Lexical engine. */
function PayloadField({ paths, name, readOnly }: { paths: ChildPaths; name: string; readOnly: boolean }) {
  const field = childField(paths.fields, name);
  if (!field) return null;
  return (
    <div className="byline-payload-field">
      <RenderFields
        fields={[field]}
        parentPath={paths.parentPath}
        parentSchemaPath={paths.parentSchemaPath}
        parentIndexPath={paths.parentIndexPath}
        permissions={(paths.permissions ?? true) as never}
        readOnly={readOnly}
        margins={false}
      />
    </div>
  );
}

function Toggle<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: ReadonlyArray<{ value: T; label: string }>; value: T; onChange: (next: T) => void; disabled: boolean }) {
  return (
    <ToggleGroup aria-label={label} variant="outline" size="sm" spacing={0} value={[value]} disabled={disabled} onValueChange={(next) => {
      const chosen = next[0] as T | undefined;
      if (chosen && chosen !== value) onChange(chosen);
    }}>
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>{option.label}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Enter in a one-line input must not submit Payload's document form. */
const noSubmit = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.preventDefault();
};

/**
 * Write: the article itself, close to the reading measure. Every input is the
 * story form's own field, so autosave, validation, drafts and publishing see
 * exactly what the writer typed.
 */
export function WriteTab({ context, paths }: { context: StoryScreenContext; paths: ChildPaths }) {
  const readOnly = context.readOnly;
  const kicker = useStoryField<string>("kicker");
  const headline = useStoryField<string>("headline");
  const deck = useStoryField<string>("deck");
  const contributors = useStoryField<Id[]>("contributors");
  const section = useStoryField<Id | null>("section");
  const topics = useStoryField<Id[]>("topics");
  const contentFormat = useStoryField<string>("contentFormat");
  const format = useStoryField<string>("format");
  const videoUrl = useStoryField<string>("video.url");
  const presentation = useStoryField<string>("presentation");
  const alignment = useStoryField<string>("immersiveAlignment");
  const live = useStoryField<"off" | "live" | "ended">("liveCoverage.state");
  const reportingNote = useStoryField<string>("reportingNote");

  const people = useOptions(context.api, "people", "name");
  const sections = useOptions(context.api, "sections", "name");
  const topicOptions = useOptions(context.api, "topics", "name");

  const legacy = contentFormat.value === "legacy-html";
  const url = videoUrl.value ?? "";
  const videoProblem = format.value === "video" && url.trim() !== "" && !parseYouTubeVideoId(url) ? "That is not a YouTube video link." : null;

  const host = useNewsroomEditorHost();

  return (
    <BylineEditorHostProvider host={host}>
    <div className="flex flex-col gap-8">
      <article className="flex w-full flex-col gap-6" aria-label="Article">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-4 md:px-0">
        <Input aria-label="Kicker" onKeyDown={noSubmit} placeholder="Kicker" value={kicker.value ?? ""} onChange={(event) => kicker.setValue(event.target.value)} disabled={readOnly} className="h-7 w-auto max-w-xs border-transparent bg-transparent focus-visible:ring-0 px-0 text-xs font-medium tracking-wide uppercase shadow-none" />
        <Textarea aria-label="Headline" placeholder="Headline" rows={2} value={headline.value ?? ""} onChange={(event) => headline.setValue(event.target.value)} disabled={readOnly} aria-invalid={headline.error ? true : undefined} className="min-h-0 resize-none border-transparent bg-transparent focus-visible:ring-0 px-0 text-3xl leading-tight font-semibold tracking-tight shadow-none md:text-4xl" />
        {headline.error ? <p className="text-xs text-destructive">{headline.error}</p> : null}
        <Textarea aria-label="Deck" placeholder="Deck: one or two sentences under the headline" rows={2} value={deck.value ?? ""} onChange={(event) => deck.setValue(event.target.value)} disabled={readOnly} className="min-h-0 resize-none border-transparent bg-transparent focus-visible:ring-0 px-0 text-lg text-muted-foreground shadow-none" />
        <FieldGroup className="gap-1">
          <Property label="Byline">
            <div className="flex flex-wrap items-center gap-1"><MultiPicker label="Byline" placeholder="Add contributors" options={people} value={relationIdsOf(contributors.value)} onChange={(ids) => contributors.setValue(ids)} disabled={readOnly} />
            {!readOnly && (context.role === "editor" || context.role === "administrator") ? <QuickCreateRelation context={context} kind="guest" onCreated={(id) => contributors.setValue([...relationIdsOf(contributors.value), id])} /> : null}</div>
          </Property>
          <div id="byline-story-section"><Property label="Section">
            <SinglePicker label="Section" placeholder="No section" options={sections} value={relationIdOf(section.value)} onChange={(id) => section.setValue(id)} disabled={readOnly} />
          </Property></div>
          <Property label="Topics">
            <div className="flex flex-wrap items-center gap-1"><MultiPicker label="Topics" placeholder="Add topics" options={topicOptions} value={relationIdsOf(topics.value)} onChange={(ids) => topics.setValue(ids)} disabled={readOnly} />
            {!readOnly ? <QuickCreateRelation context={context} kind="topic" onCreated={(id) => topics.setValue([...relationIdsOf(topics.value), id])} /> : null}</div>
          </Property>
        </FieldGroup>
        <StoryURL context={context} />
        <Separator />
        <section aria-label="Lead image" className="flex flex-col gap-2">
          <LeadImage readOnly={readOnly} />
        </section>
        {legacy ? (
          <Alert>
            <AlertTitle>Imported from WordPress</AlertTitle>
            <AlertDescription>This story keeps the body it was published with and renders exactly as before. Converting it to the Byline editor is a separate, reviewed step.</AlertDescription>
          </Alert>
        ) : null}
      </div>
        {legacy ? null : (
          // The body is written in the article itself: the public measure, type and story blocks.
          <section aria-label="Story body" className="byline-story-body">
            <ArticleCanvas>
              <PayloadField paths={paths} name="body" readOnly={readOnly} />
            </ArticleCanvas>
          </section>
        )}
      </article>

      <section aria-labelledby="story-presentation" className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-4 md:px-0">
        <SectionHeading><span id="story-presentation">Presentation</span></SectionHeading>
        <FieldGroup className="gap-1">
          <Property label="Format">
            <Toggle label="Format" options={STORY_FORMAT_OPTIONS} value={(format.value ?? "standard") as (typeof STORY_FORMAT_OPTIONS)[number]["value"]} onChange={(next) => format.setValue(next)} disabled={readOnly} />
          </Property>
          {format.value === "video" ? (
            <Property label="YouTube video" htmlFor="story-video-url">
              <Input id="story-video-url" onKeyDown={noSubmit} type="url" inputMode="url" placeholder="Paste a YouTube link" value={url} onChange={(event) => videoUrl.setValue(event.target.value)} disabled={readOnly} aria-invalid={videoProblem ? true : undefined} />
              {videoProblem ? <p className="text-xs text-destructive">{videoProblem}</p> : null}
            </Property>
          ) : null}
          <Property label="Presentation">
            <Toggle label="Presentation" options={STORY_PRESENTATION_OPTIONS} value={(presentation.value ?? "standard") as (typeof STORY_PRESENTATION_OPTIONS)[number]["value"]} onChange={(next) => presentation.setValue(next)} disabled={readOnly} />
          </Property>
          {presentation.value === "immersive" ? (
            <Property label="Headline position">
              <Toggle label="Headline position" options={IMMERSIVE_ALIGNMENT_OPTIONS} value={(alignment.value ?? "bottom-left") as (typeof IMMERSIVE_ALIGNMENT_OPTIONS)[number]["value"]} onChange={(next) => alignment.setValue(next)} disabled={readOnly} />
            </Property>
          ) : null}
        </FieldGroup>
      </section>

      {context.role !== "staff" || (live.value && live.value !== "off") ? <section aria-label="Live coverage" className="mx-auto flex w-full max-w-[760px] flex-col gap-2 px-4 md:px-0">
        <SectionHeading>Live coverage</SectionHeading>
        <Toggle label="Live coverage status" options={LIVE_COVERAGE_STATE_OPTIONS} value={live.value ?? "off"} onChange={(next) => live.setValue(next)} disabled={readOnly || context.role === "staff"} />
      </section> : null}
      <section aria-labelledby="story-reporting-note" className="mx-auto flex w-full max-w-[760px] flex-col gap-2 px-4 md:px-0">
        <SectionHeading><span id="story-reporting-note">How we reported this</span></SectionHeading>
        <Textarea aria-labelledby="story-reporting-note" rows={3} value={reportingNote.value ?? ""} onChange={(event) => reportingNote.setValue(event.target.value)} disabled={readOnly} placeholder="Optional note to readers about sourcing and methods" />
      </section>
    </div>
    </BylineEditorHostProvider>
  );
}
