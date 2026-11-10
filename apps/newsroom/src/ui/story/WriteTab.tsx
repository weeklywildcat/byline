"use client";

import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Button } from "@byline/newsroom-ui/ui/button";
import { FieldGroup } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Separator } from "@byline/newsroom-ui/ui/separator";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { parseYouTubeVideoId } from "@byline/core";
import { BylineEditorHostProvider, type StoryBlockInserter } from "@byline/editor/client";
import { ReportingSheet } from "../reporting/ReportingSheet";
import type { SelectionView } from "../reporting/api";
import { RenderFields } from "@payloadcms/ui";
import { Plus } from "lucide-react";
import type { ClientField, SanitizedFieldPermissions } from "payload";
import { useCallback, useRef, useState, type KeyboardEvent } from "react";
import { STORY_FORMAT_OPTIONS } from "../../domain/vocabulary";

import { LiveCoverageSection } from "../live/LiveCoverageSection";
import { StoryModeControl } from "../live/LiveModeControl";
import { ArticleCanvas } from "./ArticleCanvas";
import { useNewsroomEditorHost } from "./editor-host";
import { childField, relationIdOf, relationIdsOf, useStoryField } from "./form";
import { LeadImage } from "./LeadImage";
import { Property, SectionHeading } from "./parts";
import { QuickCreateRelation } from "./QuickCreateRelation";
import { MultiPicker, SinglePicker, useOptions } from "./RelationPickers";
import type { StoryScreenContext } from "./StoryScreen";
import type { Id } from "./types";

const FORMAT_OPTIONS = STORY_FORMAT_OPTIONS.map((option) => option.value === "standard" ? { ...option, label: "Article" } : option);

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

function ChoiceSelect<T extends string>({ label, options, value, onChange, disabled }: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  disabled: boolean;
}) {
  const items = options.map((option) => ({ value: option.value, label: option.label }));
  return (
    <Select items={items} value={value} disabled={disabled} onValueChange={(next) => {
      if (next) onChange(next as T);
    }}>
      <SelectTrigger aria-label={label} size="sm" className="-ml-2 max-w-full border-transparent bg-transparent px-2 font-normal hover:bg-muted">
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Enter in a one-line input must not submit Payload's document form. */
const noSubmit = (event: KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.preventDefault();
};

/**
 * Write is deliberately the reader-facing article plus the few properties a
 * writer needs constantly. Publishing, presentation, URL and live-coverage
 * controls live in Story details in the document header instead of below the
 * copy.
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
  const reportingNote = useStoryField<string>("reportingNote");
  const [kickerOpen, setKickerOpen] = useState(false);
  const [reportingNoteOpen, setReportingNoteOpen] = useState(false);

  const people = useOptions(context.api, "people", "name");
  const sections = useOptions(context.api, "sections", "name");
  const topicOptions = useOptions(context.api, "topics", "name");

  const legacy = contentFormat.value === "legacy-html";
  const url = videoUrl.value ?? "";
  const videoProblem = format.value === "video" && url.trim() !== "" && !parseYouTubeVideoId(url) ? "That is not a YouTube video link." : null;
  const showKicker = kickerOpen || Boolean(kicker.value?.trim());
  const showReportingNote = reportingNoteOpen || Boolean(reportingNote.value?.trim());
  // The canvas hands its block inserter here; the Reporting sheet inserts a Reported Quote through it.
  const inserter = useRef<StoryBlockInserter | null>(null);
  const registerInserter = useCallback((next: StoryBlockInserter | null) => { inserter.current = next; }, []);
  const host = useNewsroomEditorHost(registerInserter);
  const insertQuote = useCallback((quote: SelectionView) => inserter.current?.("reportedQuote", { text: quote.text, attribution: quote.attribution, reportingSelection: quote.id }) ?? false, []);

  return (
    <BylineEditorHostProvider host={host}>
      <div className="flex flex-col gap-8">
        <article className="flex w-full flex-col gap-6" aria-label="Article">
          <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3 px-4 md:px-0">
            {showKicker ? (
              <Input
                aria-label="Label above headline"
                onKeyDown={noSubmit}
                placeholder="Label above headline"
                value={kicker.value ?? ""}
                onChange={(event) => kicker.setValue(event.target.value)}
                onFocus={() => setKickerOpen(true)}
                disabled={readOnly}
                autoFocus={kickerOpen && !kicker.value}
                className="h-7 w-auto max-w-sm border-transparent bg-transparent px-0 text-xs font-medium tracking-wide uppercase shadow-none focus-visible:ring-0"
              />
            ) : readOnly ? null : (
              <Button type="button" variant="ghost" size="xs" className="-ml-2 w-fit text-muted-foreground" onClick={() => setKickerOpen(true)}>
                <Plus />
                Add label above headline
              </Button>
            )}
            <Textarea
              aria-label="Headline"
              placeholder="Headline"
              rows={2}
              value={headline.value ?? ""}
              onChange={(event) => headline.setValue(event.target.value)}
              disabled={readOnly}
              aria-invalid={headline.error ? true : undefined}
              className="min-h-0 resize-none border-transparent bg-transparent px-0 text-3xl leading-tight font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-4xl"
            />
            {headline.error ? <p className="text-xs text-destructive">{headline.error}</p> : null}
            <Textarea
              aria-label="Deck"
              placeholder="Deck: one or two sentences under the headline"
              rows={2}
              value={deck.value ?? ""}
              onChange={(event) => deck.setValue(event.target.value)}
              disabled={readOnly}
              className="min-h-0 resize-none border-transparent bg-transparent px-0 text-lg text-muted-foreground shadow-none focus-visible:ring-0"
            />

            <FieldGroup className="gap-0.5 pt-1">
              <Property label="Byline">
                <MultiPicker
                  label="Byline"
                  placeholder="Add contributors"
                  options={people}
                  value={relationIdsOf(contributors.value)}
                  onChange={(ids) => contributors.setValue(ids)}
                  disabled={readOnly}
                  footer={!readOnly && (context.role === "editor" || context.role === "administrator")
                    ? <QuickCreateRelation context={context} kind="guest" onCreated={(id) => contributors.setValue([...relationIdsOf(contributors.value), id])} />
                    : null}
                />
              </Property>
              <div id="byline-story-section">
                <Property label="Section">
                  <SinglePicker label="Section" placeholder="No section" options={sections} value={relationIdOf(section.value)} onChange={(id) => section.setValue(id)} disabled={readOnly} />
                </Property>
              </div>
              <Property label="Topics">
                <MultiPicker
                  label="Topics"
                  placeholder="Add topics"
                  options={topicOptions}
                  value={relationIdsOf(topics.value)}
                  onChange={(ids) => topics.setValue(ids)}
                  disabled={readOnly}
                  footer={!readOnly ? <QuickCreateRelation context={context} kind="topic" onCreated={(id) => topics.setValue([...relationIdsOf(topics.value), id])} /> : null}
                />
              </Property>
              <Property label="Story type">
                <ChoiceSelect
                  label="Story type"
                  options={FORMAT_OPTIONS}
                  value={(format.value ?? "standard") as (typeof STORY_FORMAT_OPTIONS)[number]["value"]}
                  onChange={(next) => format.setValue(next)}
                  disabled={readOnly}
                />
              </Property>
              <StoryModeControl />
              {format.value === "video" ? (
                <Property label="YouTube video" htmlFor="story-video-url">
                  <div className="flex max-w-lg flex-col gap-1">
                    <Input
                      id="story-video-url"
                      onKeyDown={noSubmit}
                      type="url"
                      inputMode="url"
                      placeholder="Paste a YouTube link"
                      value={url}
                      onChange={(event) => videoUrl.setValue(event.target.value)}
                      disabled={readOnly}
                      aria-invalid={videoProblem ? true : undefined}
                      className="h-7"
                    />
                    {videoProblem ? <p className="text-xs text-destructive">{videoProblem}</p> : null}
                  </div>
                </Property>
              ) : null}
            </FieldGroup>

            <Separator className="mt-2" />
            <section aria-label="Lead image" className="flex flex-col gap-2">
              <LeadImage readOnly={readOnly} />
            </section>
            {legacy ? (
              <Alert>
                <AlertTitle>Archived HTML</AlertTitle>
                <AlertDescription>This story keeps the body it was published with and renders exactly as before. Converting it to the Byline editor is a separate, reviewed step.</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {legacy ? null : (
            <section aria-label="Story body" className="byline-story-body">
              {context.readOnly || !Number.isSafeInteger(Number(context.storyId)) ? null : (
                <div className="mx-auto mb-1 flex w-full max-w-[760px] justify-end px-4 md:px-0"><ReportingSheet context={context} insert={insertQuote} /></div>
              )}
              <ArticleCanvas>
                <PayloadField paths={paths} name="body" readOnly={readOnly} />
              </ArticleCanvas>
            </section>
          )}
        </article>

        <LiveCoverageSection />

        <div className="mx-auto w-full max-w-[760px] px-4 md:px-0">
          {showReportingNote ? (
            <section aria-labelledby="story-reporting-note" className="flex flex-col gap-2 border-t border-border pt-5">
              <SectionHeading><span id="story-reporting-note">How we reported this</span></SectionHeading>
              <p className="text-xs text-muted-foreground">Optional reader-facing note about sourcing, reporting or methodology.</p>
              <Textarea
                aria-labelledby="story-reporting-note"
                rows={3}
                value={reportingNote.value ?? ""}
                onChange={(event) => reportingNote.setValue(event.target.value)}
                onFocus={() => setReportingNoteOpen(true)}
                disabled={readOnly}
                placeholder="Explain anything readers should know about how this story was reported."
              />
            </section>
          ) : readOnly ? null : (
            <Button type="button" variant="ghost" size="sm" className="-ml-2 text-muted-foreground" onClick={() => setReportingNoteOpen(true)}>
              <Plus />
              Add “How we reported this” note
            </Button>
          )}
        </div>
      </div>
    </BylineEditorHostProvider>
  );
}
