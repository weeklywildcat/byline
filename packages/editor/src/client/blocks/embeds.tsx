"use client";

import {
  addRow,
  altFor,
  ARTICLE_BLOCK_LIMITS as LIMITS,
  chartDataProblem,
  chartModel,
  NATIVE_CHART_BOUNDS,
  removeColumn,
  removeRow,
  safeWebUrl,
  visualizationPieceName,
  visualizationPreviewNote,
  visualizationProviders,
  visualizationUrl,
  type ArticleMediaAsset,
  type ChartMapHeight,
  type NativeChartType
} from "@byline/article-body";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { Field, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { parseYouTubeVideoId } from "@byline/core";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@byline/newsroom-ui/ui/combobox";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { ArticleImage, AudioFigure, ChartMapFigure, NativeChart, RepositoryInteractiveFigure, RepositoryTrackerFigure, VideoFigure, youTubeWatch } from "@byline/ui/article-body";
import { ChevronDown, ExternalLink, Link2, ListPlus, Plus, Rows3, ScrollText, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { newRowId } from "../../fields";
import { BlockShell, SecondarySetting, ToolButton, ToolTextButton } from "../chrome";
import { addChapter, ChaptersEditor } from "./chapters";
import { PasteTableSetting, useGridEditing } from "./grid";
import { InlineText } from "../fields";
import { useFocusWhenCreated } from "../focus";
import { useAnnounce, useBylineEditorHost, useMediaAsset } from "../host";
import { MediaPlaceholder, MediaStatus } from "./media";
import { BlockIcon } from "../icons";
import { SettingsSurface } from "../chrome";
import { AltTextSetting } from "./media";
import { ChoiceToggle, ImageActions, ImageSlot, ParagraphFields, usePrivilegedNode, useReplaceImage } from "./parts";
import { focusIn, useReadiness, useTypedFields, type BlockEditorProps } from "./shared";

export function VideoEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("video", node);
  const issues = useReadiness("video", id, node.fields);
  const url = useRef<HTMLTextAreaElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, url);
  const readOnly = !node.editable;
  const videoId = parseYouTubeVideoId(fields.url);
  const announce = useAnnounce();
  const root = () => node.editor.getElementByKey(nodeKey);
  const [showTranscript, setShowTranscript] = useState(false);
  const transcriptOpen = showTranscript || Boolean(fields.transcript);
  const newChapter = () => {
    const next = addChapter(fields.chapters);
    if (!next) return;
    set({ chapters: next });
    announce(`Chapter added. ${next.length} in all.`);
    focusIn(root(), `[data-chapter-index="${next.length - 1}"] .byline-chapter-time`);
  };
  return (
    <BlockShell
      type="video"
      node={node}
      issues={issues}
      actions={
        <ButtonGroup>
          <ToolTextButton label="Add chapter" icon={<ListPlus />} disabled={fields.chapters.length >= LIMITS.chaptersMax} onClick={newChapter} />
          {transcriptOpen ? null : <ToolTextButton label="Add transcript" icon={<ScrollText />} onClick={() => { setShowTranscript(true); focusIn(root(), ".byline-video-transcript .byline-field"); }} />}
        </ButtonGroup>
      }
    >
      <VideoFigure
        videoId={videoId ?? "00000000000"}
        title={<InlineText inputRef={title} label="Video title" placeholder="Title of the video" value={fields.title} maxLength={LIMITS.videoTitle} readOnly={readOnly} onEnter={() => undefined} onChange={(value) => set({ title: value })} />}
        // The canvas never loads the YouTube player: it shows where it will be, and the published page plays it.
        player={
          <div className="byline-video-placeholder" data-byline-chrome="">
            <span>{videoId ? "The video plays here on the published story." : "Paste a YouTube address below."}</span>
            <InlineText inputRef={url} label="YouTube address" placeholder="https://www.youtube.com/watch?v=…" value={fields.url} maxLength={2048} readOnly={readOnly} onEnter={() => title.current?.focus()} onChange={(value) => set({ url: value.trim() })} />
            {fields.url && !videoId ? <span role="alert">That is not a YouTube address.</span> : null}
          </div>
        }
        caption={<InlineText className="byline-caption" label="Caption (optional)" placeholder="Caption (optional)" value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
        chapters={<ChaptersEditor chapters={fields.chapters} readOnly={readOnly} root={root} announce={announce} onChange={(chapters) => set({ chapters })} />}
        transcript={transcriptOpen ? <ParagraphFields scope=".byline-audio-transcript-text" label="Transcript (optional)" placeholder="The words spoken in the video (optional). Captions stay required." value={fields.transcript} readOnly={readOnly} onChange={(value) => set({ transcript: value.slice(0, LIMITS.videoTranscript) })} /> : undefined}
      />
      <label className="byline-confirm" data-byline-chrome="" contentEditable={false}>
        <Checkbox checked={fields.captionsConfirmed} disabled={readOnly} onCheckedChange={(checked) => set({ captionsConfirmed: checked === true })} aria-label="This video has captions" />
        <span>This video has captions. Required to publish.</span>
      </label>
    </BlockShell>
  );
}

export function AudioEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("audio", node);
  const issues = useReadiness("audio", id, node.fields);
  const media = useMediaAsset(fields.media);
  const announce = useAnnounce();
  const chooseRef = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, fields.media === null ? chooseRef : title);
  const readOnly = !node.editable;
  const asset = media.asset;
  const root = () => node.editor.getElementByKey(nodeKey);
  const newChapter = () => {
    const next = addChapter(fields.chapters);
    if (!next) return;
    set({ chapters: next });
    announce(`Chapter added. ${next.length} in all.`);
    focusIn(root(), `[data-chapter-index="${next.length - 1}"] .byline-chapter-time`);
  };
  if (fields.media === null) {
    return (
      <BlockShell type="audio" node={node} issues={issues}>
        <MediaPlaceholder kind="audio" title="Add a recording" description="Choose an audio file from Media or upload one. A transcript is required to publish it." readOnly={readOnly} onChosen={(assets) => {
          if (assets[0]) {
            set({ media: assets[0].id });
            announce("Recording chosen.");
          }
        }} chooseRef={chooseRef} />
      </BlockShell>
    );
  }
  return (
    <BlockShell type="audio" node={node} issues={issues} actions={<ButtonGroup><ToolTextButton label="Add chapter" icon={<ListPlus />} disabled={fields.chapters.length >= LIMITS.chaptersMax} onClick={newChapter} /></ButtonGroup>}>
      <AudioFigure
        editing
        chapters={<ChaptersEditor chapters={fields.chapters} readOnly={readOnly} root={root} announce={announce} onChange={(chapters) => set({ chapters })} />}
        title={<InlineText inputRef={title} label="Recording title" placeholder="Who is speaking, and about what" value={fields.title} maxLength={LIMITS.audioTitle} readOnly={readOnly} onEnter={() => transcript.current?.focus()} onChange={(value) => set({ title: value })} />}
        caption={<InlineText className="byline-caption" label="Context (optional)" placeholder="When and where it was recorded (optional)" value={fields.caption} maxLength={LIMITS.caption} readOnly={readOnly} multiline onChange={(value) => set({ caption: value })} />}
        player={asset ? <audio controls preload="metadata" src={asset.src} /> : <MediaStatus status={media.status === "loading" ? "loading" : "missing"} kind="audio" />}
        transcript={<ParagraphFields scope=".byline-audio-transcript-text" inputRef={transcript} label="Transcript" placeholder="The words spoken in the recording. Required to publish." value={fields.transcript} readOnly={readOnly} onChange={(value) => set({ transcript: value.slice(0, LIMITS.audioTranscript) })} />}
      />
    </BlockShell>
  );
}

const HEIGHTS: ReadonlyArray<{ value: ChartMapHeight; label: string }> = [
  { value: "compact", label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "tall", label: "Tall" },
  { value: "map", label: "Map" }
];

const MODES = [{ value: "native", label: "Create chart" }, { value: "interactive", label: "Embed" }, { value: "static", label: "Graphic" }] as const;
const CHART_TYPES: ReadonlyArray<{ value: NativeChartType; label: string }> = [{ value: "bar", label: "Bar" }, { value: "line", label: "Line" }, { value: "dot", label: "Dot" }];

/**
 * A native chart's data, edited as a small grid right under the chart it
 * draws: the first column names each category, every other column is one
 * series of numbers. Same keyboard and paste behaviour as Data Table.
 */
function NativeChartData({ grid, readOnly }: { grid: ReturnType<typeof useGridEditing>; readOnly: boolean }) {
  const { table, apply, cell } = grid;
  const problem = chartDataProblem(table);
  return (
    <div className="byline-chart-editor-data" data-byline-chrome="" data-problem={problem ? "" : undefined} role="group" aria-label="Chart data">
      <p className="byline-kicker">Data · {table.rows.length} {table.rows.length === 1 ? "row" : "rows"}, {table.columns.length - 1} series</p>
      <div className="byline-data-table">
        <div className="byline-data-table-scroll">
          <table>
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column.id} scope="col">
                    <span className="byline-table-header">
                      {cell(-1, index, column.label, index === 0 ? "Label column header" : `Series ${index} name`, readOnly, true, index === 0 ? "Label" : `Series ${index}`)}
                      {readOnly || index === 0 ? null : <ToolButton label={`Remove series ${index}`} disabled={table.columns.length <= 2} onClick={() => apply(removeColumn(table, index, NATIVE_CHART_BOUNDS), "Series removed.", { row: -1, column: index - 1 })}><Trash2 /></ToolButton>}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={row.id}>
                  {row.cells.map((value, column) => (column === 0
                    ? <th key={column} scope="row">{cell(rowIndex, column, value, `Row ${rowIndex + 1} label`, readOnly)}</th>
                    : <td key={column}>{cell(rowIndex, column, value, `Row ${rowIndex + 1}, ${table.columns[column]?.label || `series ${column}`}`, readOnly)}</td>))}
                  {readOnly ? null : <td className="byline-table-row-actions"><ToolButton label={`Remove row ${rowIndex + 1}`} disabled={table.rows.length <= 1} onClick={() => apply(removeRow(table, rowIndex), "Row removed.", { row: Math.max(0, rowIndex - 1), column: 0 })}><Trash2 /></ToolButton></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {readOnly ? null : (
        <div className="byline-list-footer">
          <Button type="button" variant="ghost" size="sm" disabled={table.rows.length >= NATIVE_CHART_BOUNDS.rowsMax} onClick={() => apply(addRow(table, table.rows.length, newRowId(), NATIVE_CHART_BOUNDS), "Row added.", { row: table.rows.length, column: 0 })}><Rows3 />Add row</Button>
          <Button type="button" variant="ghost" size="sm" disabled={table.columns.length >= NATIVE_CHART_BOUNDS.columnsMax} onClick={() => apply({ columns: [...table.columns, { id: newRowId(), label: "" }], rows: table.rows.map((row) => ({ ...row, cells: [...row.cells, ""] })) }, "Series added.", { row: -1, column: table.columns.length })}><Plus />Add series</Button>
          <span>{problem ?? `Up to ${LIMITS.chartSeriesMax} series · paste cells from a spreadsheet`}</span>
        </div>
      )}
    </div>
  );
}

export function ChartMapEditor({ node, id, nodeKey }: BlockEditorProps) {
  const [fields, set] = useTypedFields("chartMap", node);
  const issues = useReadiness("chartMap", id, node.fields);
  const media = useMediaAsset(fields.image);
  const announce = useAnnounce();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const summary = useRef<HTMLTextAreaElement>(null);
  const sourceUrlId = useId();
  useFocusWhenCreated(nodeKey, titleRef);
  const readOnly = !node.editable;
  const asset = media.asset;
  const root = () => node.editor.getElementByKey(nodeKey);
  const native = fields.mode === "native";
  const embed = fields.mode === "interactive" ? visualizationUrl(fields.url) : null;
  const replace = useReplaceImage(fields.mode === "static" ? "Choose the graphic" : "Choose a fallback graphic", (chosen) => set({ image: chosen.id }));
  const use = (assets: ArticleMediaAsset[]) => {
    if (assets[0]) {
      set({ image: assets[0].id });
      announce("Graphic chosen.");
    }
  };
  const data = { columns: fields.columns, rows: fields.rows };
  const drawable = native && chartModel(data).series.some((series) => series.values.some((value) => value !== null));
  const sourceUrlInvalid = Boolean(fields.sourceUrl.trim()) && !safeWebUrl(fields.sourceUrl);
  const grid = useGridEditing({ table: data, bounds: NATIVE_CHART_BOUNDS, cellMax: LIMITS.chartLabel, root, announce, write: (next) => set({ columns: next.columns, rows: next.rows }) });

  const graphic = native
    ? (drawable ? <NativeChart type={fields.chartType} data={data} labelledBy={`${id}-title`} /> : <div className="byline-visualization-placeholder" data-byline-chrome="">The chart draws itself here as you type numbers in the table below.</div>)
    : fields.mode === "static"
      ? <ImageSlot media={fields.image} alt={fields.altOverride} readOnly={readOnly} onChosen={use} empty={{ title: "Add the graphic", description: "Choose the chart or map image from Media, or upload it." }}>{(_asset, image) => <div className="byline-visualization-fallback-image">{image}</div>}</ImageSlot>
      : (
        <>
          {asset ? <div className="byline-visualization-fallback-image"><ArticleImage asset={asset} alt={altFor(asset, fields.altOverride)} /></div> : null}
          <p className="byline-visualization-badge" data-byline-chrome="">
            <strong>Preview:</strong> {visualizationPreviewNote(embed?.provider ?? "")}
          </p>
          {asset ? null : <div className="byline-visualization-placeholder" data-byline-chrome="">{embed ? visualizationPieceName(embed.provider) : "Interactive chart or map"}</div>}
        </>
      );

  return (
    <BlockShell
      type="chartMap"
      node={node}
      issues={issues}
      actions={
        <>
          <ChoiceToggle label="Kind" value={fields.mode} options={MODES} onChange={(mode) => {
            set({ mode });
            announce(mode === "native" ? "Create chart: draw it from your numbers." : mode === "interactive" ? "Embed a Datawrapper, Flourish or map address." : "Graphic: an image from Media.");
          }} />
          {native ? (
            <>
              <ChoiceToggle label="Chart type" value={fields.chartType} options={CHART_TYPES} onChange={(chartType) => { set({ chartType }); announce(`${CHART_TYPES.find((entry) => entry.value === chartType)?.label} chart.`); }} />
              <PasteTableSetting description="Copy cells in Google Sheets or Excel: a label column, then one column of numbers per series. The first row names them." onPaste={grid.replaceWith} />
              <SecondarySetting label="Source link" title="Link to the data" description="Optional: a public page where readers can check the numbers." icon={<Link2 />}>
                <Field data-invalid={sourceUrlInvalid || undefined}>
                  <FieldLabel htmlFor={sourceUrlId}>Source address</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon><Link2 /></InputGroupAddon>
                    <InputGroupInput id={sourceUrlId} type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="https://" value={fields.sourceUrl} readOnly={readOnly} aria-invalid={sourceUrlInvalid || undefined} onChange={(event) => set({ sourceUrl: event.target.value.trim() })} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} />
                  </InputGroup>
                  {sourceUrlInvalid ? <FieldError>Use a web address that starts with https://.</FieldError> : null}
                </Field>
              </SecondarySetting>
            </>
          ) : (
            <>
              <ImageActions media={fields.image} label="Replace graphic" onReplace={() => void replace()} />
              {fields.image === null && fields.mode === "interactive" ? <Button type="button" variant="ghost" size="sm" onClick={() => void replace()}>Add fallback graphic</Button> : null}
              {fields.mode === "interactive" ? <ChoiceToggle label="Height" value={fields.height} options={HEIGHTS} onChange={(height) => set({ height })} /> : null}
              {fields.image !== null ? <AltTextSetting asset={asset} value={fields.altOverride} readOnly={readOnly} onChange={(altOverride) => set({ altOverride })} /> : null}
            </>
          )}
        </>
      }
    >
      <ChartMapFigure
        mode={fields.mode}
        provider={embed?.provider}
        src={embed?.src}
        height={fields.height}
        titleId={`${id}-title`}
        title={<InlineText inputRef={titleRef} label="Title" placeholder={native ? "The takeaway, in a headline: what the numbers show" : "What the chart or map shows"} value={fields.title} maxLength={LIMITS.chartTitle} readOnly={readOnly} onEnter={() => summary.current?.focus()} onChange={(value) => set({ title: value })} />}
        dek={<InlineText label="Description (optional)" placeholder={native ? "Exactly what is measured, where and when" : "What is measured, where and when (optional)"} value={fields.dek} maxLength={LIMITS.chartDek} readOnly={readOnly} multiline onChange={(value) => set({ dek: value })} />}
        media={graphic}
        link={native ? (
          <NativeChartData grid={grid} readOnly={readOnly} />
        ) : fields.mode === "interactive" ? (
          <div className="byline-visualization-link" data-byline-chrome="" contentEditable={false}>
            <InlineText label="Chart or map address" placeholder="Paste a Datawrapper, Flourish, Google Maps or OpenStreetMap address" value={fields.url} maxLength={2048} readOnly={readOnly} onChange={(value) => set({ url: value.trim() })} />
            {fields.url && !embed ? <p role="alert">That address is not from an allowed provider. {Object.values(visualizationProviders).map((provider) => provider.label).join(", ")}.</p> : embed ? <p><ExternalLink aria-hidden="true" /> {visualizationPieceName(embed.provider)}</p> : null}
          </div>
        ) : undefined}
        summary={<InlineText inputRef={summary} label="What it shows, in words" placeholder="The important finding, in a sentence or two. Readers who cannot see the graphic rely on this." value={fields.summary} maxLength={LIMITS.chartSummary} readOnly={readOnly} multiline onChange={(value) => set({ summary: value })} />}
        source={<InlineText label="Source" placeholder={native ? "Where the numbers come from" : "Source"} value={fields.source} maxLength={LIMITS.chartSource} readOnly={readOnly} onChange={(value) => set({ source: value })} />}
        notes={<InlineText label="Notes (optional)" placeholder="Notes (optional)" value={fields.notes} maxLength={LIMITS.chartNotes} readOnly={readOnly} multiline onChange={(value) => set({ notes: value })} />}
        credit={native ? undefined : <InlineText label="Credit (optional)" placeholder="Credit (optional)" value={fields.credit} maxLength={LIMITS.chartCredit} readOnly={readOnly} onChange={(value) => set({ credit: value })} />}
      />
    </BlockShell>
  );

}

/** Editors and administrators only: pick one of the repository's registered interactives. The code is never edited here. */
export function RepositoryInteractiveEditor({ node: rawNode, id, nodeKey }: BlockEditorProps) {
  const node = usePrivilegedNode(rawNode);
  const [fields, set] = useTypedFields("repositoryInteractive", node);
  const issues = useReadiness("repositoryInteractive", id, node.fields);
  const { interactives = [] } = useBylineEditorHost();
  const title = useRef<HTMLTextAreaElement>(null);
  useFocusWhenCreated(nodeKey, title);
  const readOnly = !node.editable;
  const registered = interactives.find((entry) => entry.key === fields.key);
  return (
    <BlockShell
      type="repositoryInteractive"
      node={node}
      issues={issues}
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" aria-label="Choose an interactive" />}>
            {registered?.name ?? (fields.key ? `Missing: ${fields.key}` : "Choose an interactive")}
            <ChevronDown />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            {interactives.length ? interactives.map((entry) => (
              <DropdownMenuItem key={entry.key} onClick={() => set({ key: entry.key, title: fields.title || entry.name, description: fields.description || entry.description })}>
                <span className="flex flex-col">
                  <span>{entry.name}</span>
                  <span className="text-xs text-muted-foreground">{entry.description}</span>
                </span>
              </DropdownMenuItem>
            )) : <DropdownMenuItem disabled>No interactives are registered in the site's code.</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      <RepositoryInteractiveFigure
        interactiveKey={fields.key || "none"}
        title={<InlineText inputRef={title} label="Title" placeholder="Title" value={fields.title} maxLength={LIMITS.interactiveTitle} readOnly={readOnly} onChange={(value) => set({ title: value })} />}
        description={<InlineText label="Text alternative" placeholder="Describe what it shows in words, for readers who cannot use it." value={fields.description} maxLength={LIMITS.interactiveDescription} readOnly={readOnly} multiline onChange={(value) => set({ description: value })} />}
      >
        <p className="byline-block-note" data-effect="info" data-byline-chrome="" contentEditable={false}>
          <span>{registered ? `${registered.name} loads here on the published story.` : "Choose a registered interactive above."}</span>
        </p>
      </RepositoryInteractiveFigure>
    </BlockShell>
  );
}

type TrackerChoice = { key: string; name: string; description: string };

/** A searchable local list of the trackers registered in the repository (plain data from the host, never their code). */
function TrackerCombobox({ trackers, value, onChoose, inputRef }: { trackers: readonly TrackerChoice[]; value: string; onChoose: (tracker: TrackerChoice) => void; inputRef?: React.Ref<HTMLInputElement> }) {
  const selected = trackers.find((tracker) => tracker.key === value) ?? null;
  return (
    <Combobox items={[...trackers]} value={selected} onValueChange={(next: TrackerChoice | null) => { if (next) onChoose(next); }} itemToStringLabel={(tracker: TrackerChoice) => tracker.name} isItemEqualToValue={(a: TrackerChoice, b: TrackerChoice) => a.key === b.key}>
      <ComboboxInput ref={inputRef} placeholder="Find a tracker" aria-label="Find a tracker" className="w-full" />
      <ComboboxContent>
        <ComboboxEmpty>No tracker by that name. Trackers are added in the site's code.</ComboboxEmpty>
        <ComboboxList>
          {(tracker: TrackerChoice) => (
            <ComboboxItem key={tracker.key} value={tracker}>
              <span className="flex min-w-0 flex-col">
                <span>{tracker.name}</span>
                <span className="text-xs text-muted-foreground">{tracker.description}</span>
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * Editors and administrators only: place a tracker built in the repository.
 * The canvas draws the tracker's article wrapper (title and text alternative,
 * typed in place) and a faithful static stand-in; the tracker itself, its data
 * and design change in the repository and need a deploy. Its code never loads
 * in the editor; Live Preview shows the real thing.
 */
export function RepositoryTrackerEditor({ node: rawNode, id, nodeKey }: BlockEditorProps) {
  const node = usePrivilegedNode(rawNode);
  const [fields, set] = useTypedFields("repositoryTracker", node);
  const issues = useReadiness("repositoryTracker", id, node.fields);
  const announce = useAnnounce();
  const { trackers = [] } = useBylineEditorHost();
  const chooser = useRef<HTMLInputElement>(null);
  const title = useRef<HTMLTextAreaElement>(null);
  const [replacing, setReplacing] = useState(false);
  useFocusWhenCreated(nodeKey, fields.key ? title : chooser);
  const readOnly = !node.editable;
  const registered = trackers.find((entry) => entry.key === fields.key);
  const choose = (tracker: TrackerChoice) => {
    set({ key: tracker.key, title: fields.title || tracker.name.replace(/\s*\(fixture\)$/, ""), description: fields.description || tracker.description });
    setReplacing(false);
    announce(`${tracker.name} chosen.`);
    window.requestAnimationFrame(() => title.current?.focus());
  };
  if (!fields.key) {
    return (
      <BlockShell type="repositoryTracker" node={node} issues={[]}>
        <Empty className="byline-media-empty" data-byline-chrome="" contentEditable={false}>
          <EmptyHeader>
            <EmptyMedia variant="icon"><BlockIcon icon="tracker" /></EmptyMedia>
            <EmptyTitle>Choose a tracker</EmptyTitle>
            <EmptyDescription>{trackers.length ? "Trackers are built by the developers and kept up to date in the site's code." : "No trackers are registered in the site's code yet."}</EmptyDescription>
          </EmptyHeader>
          {readOnly || !trackers.length ? null : <EmptyContent><TrackerCombobox trackers={trackers} value="" onChoose={choose} inputRef={chooser} /></EmptyContent>}
        </Empty>
      </BlockShell>
    );
  }
  return (
    <BlockShell
      type="repositoryTracker"
      node={node}
      issues={issues}
      actions={
        <SettingsSurface open={replacing} onOpenChange={setReplacing} title="Replace tracker" description="Trackers registered in the site's code." trigger={<Button type="button" variant="ghost" size="sm">Replace tracker</Button>}>
          <TrackerCombobox trackers={trackers} value={fields.key} onChoose={choose} />
        </SettingsSurface>
      }
    >
      <RepositoryTrackerFigure
        trackerKey={fields.key}
        title={<InlineText inputRef={title} label="Title" placeholder="What readers are tracking" value={fields.title} maxLength={LIMITS.trackerTitle} readOnly={readOnly} onChange={(value) => set({ title: value })} />}
        description={<InlineText label="Text alternative" placeholder="Where things stand, in words, for readers who cannot see the tracker." value={fields.description} maxLength={LIMITS.trackerDescription} readOnly={readOnly} multiline onChange={(value) => set({ description: value })} />}
      >
        <div className="byline-tracker-standin" data-byline-chrome="" contentEditable={false}>
          <BlockIcon icon="tracker" />
          <span>{registered ? `${registered.name}: shown here in Preview and on the published story.` : `Missing tracker “${fields.key}”. It is not in the site's code.`}</span>
        </div>
        <p className="byline-block-note" data-effect="info" data-byline-chrome="" contentEditable={false}>
          <span>The tracker's content and design are changed in the repository and need a deploy. Edit only the title and text alternative here.</span>
        </p>
      </RepositoryTrackerFigure>
    </BlockShell>
  );
}

export { youTubeWatch };
