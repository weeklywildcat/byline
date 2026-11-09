"use client";

import { invalidateStoryData } from "@byline/newsroom-screens/story/story-query";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { StoryVersion, StoryVersions } from "../../newsroom/story-history";
import type { Story } from "../../payload-types";
import { getJson, postJson } from "./api";
import { formatDay, SectionHeading } from "./parts";
import { StoryDistribution } from "./StoryDistribution";
import { StoryFrontPage } from "./StoryFrontPage";
import { StoryCorrections } from "./StoryCorrections";
import type { StoryScreenContext } from "./StoryScreen";

type Entry = StoryVersions["versions"][number];
function groups(versions: Entry[]): Entry[][] {
  const result: Entry[][] = [];
  for (const row of versions) {
    const last = result.at(-1);
    if (row.kind === "Autosave" && last?.[0]?.kind === "Autosave" && last[0].actor === row.actor) last.push(row);
    else result.push([row]);
  }
  return result;
}

export function HistoryTab({ context }: { context: StoryScreenContext }) {
  const { id, hasPublishedDoc, hasPublishPermission, unpublishedVersionCount, versionCount, lastUpdateTime, setData, setHasPublishedDoc, setUnpublishedVersionCount, setMostRecentVersionIsAutosaved, setLastUpdateTime, incrementVersionCount } = useDocumentInfo();
  const workspace = useQueryClient();
  const { reset } = useForm();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const autosaving = useFormBackgroundProcessing();
  const [selected, setSelected] = useState<Entry | null>(null);
  const [restoring, setRestoring] = useState<{ version: Entry["id"]; discard?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const focus = useRef<HTMLElement | null>(null);
  const endpoint = `/byline/stories/${id}`;
  const history = useQuery({
    queryKey: ["story-versions", id, versionCount, lastUpdateTime],
    queryFn: () => getJson<StoryVersions>(context.api, `${endpoint}/versions`), enabled: id != null
  });
  const version = useQuery({
    queryKey: ["story-version", id, selected?.id, selected?.at], enabled: selected !== null,
    queryFn: () => getJson<StoryVersion>(context.api, `${endpoint}/versions/${selected!.id}`)
  });
  const canRestore = !context.readOnly && !modified && !processing && !autosaving;
  const openRestore = (input: NonNullable<typeof restoring>) => {
    focus.current = document.activeElement as HTMLElement | null;
    setError(""); setRestoring(input);
  };
  async function restore() {
    if (!restoring || !canRestore) return;
    setBusy(true);
    setError("");
    try {
      const { doc, published } = await postJson<{ doc: Story; published: boolean }>(context.api, `${endpoint}/restore-version`, { ...restoring, expected: history.data?.latest });
      await reset(doc);
      setData(doc);
      setHasPublishedDoc(published);
      setMostRecentVersionIsAutosaved(false);
      setUnpublishedVersionCount(restoring.discard ? 0 : unpublishedVersionCount + 1);
      setLastUpdateTime(Date.parse(doc.updatedAt));
      incrementVersionCount();
      setRestoring(null);
      toast.success(restoring.discard ? "Unpublished changes discarded." : "Version restored to the draft.");
      void invalidateStoryData(context.shellQueries, Number(id));
      void invalidateStoryData(workspace, Number(id));
      void workspace.invalidateQueries({ queryKey: ["story-public-url", id] });
    } catch (error) {
      setError((error as Error).message);
      void history.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (id == null) return <p className="text-sm">Save the story to start its history.</p>;
  const row = (entry: Entry) => <Item key={entry.id} variant="outline" size="sm">
    <ItemContent className="min-w-0">
      <ItemTitle className="[overflow-wrap:anywhere]">{entry.kind}{entry.id === history.data?.current ? <Badge>Currently published</Badge> : null}</ItemTitle>
      <p className="text-xs text-muted-foreground">{formatDay(entry.at, context.timeZone)} · {entry.actor || "Author unavailable"}</p>
    </ItemContent>
    <Button type="button" size="sm" variant="outline" aria-expanded={selected?.id === entry.id} onClick={() => setSelected(selected?.id === entry.id ? null : entry)}>{selected?.id === entry.id ? "Hide details" : "View details"}</Button>
    {selected?.id === entry.id ? <div className="w-full border-t border-border pt-2">
      {version.isPending ? <p role="status">Loading version…</p> : version.isError ? <p role="alert">The version could not be loaded.</p> : <div className="grid gap-2 text-sm [overflow-wrap:anywhere]">
        <p className="font-medium">{version.data.title}</p>
        {version.data.deck ? <p>{version.data.deck}</p> : null}
        <p className="text-muted-foreground">Slug: {version.data.slug}</p>
        {version.data.changes?.length ? <ul className="grid gap-1">{version.data.changes.map((change) => <li key={change.label}>
          <strong>{change.label}</strong>{change.before === null ? " changed." : <><del className="mx-2 text-muted-foreground">{change.before || "(empty)"}</del><span>{change.after || "(empty)"}</span></>}
        </li>)}</ul> : <p className="text-muted-foreground">{version.data.changes ? "No tracked fields changed from the preceding version." : "This is the earliest available version."}</p>}
        <Button type="button" size="sm" className="w-fit" variant="outline" disabled={!canRestore} onClick={() => openRestore({ version: entry.id })}>Restore to draft…</Button>
      </div>}
    </div> : null}
  </Item>;

  return <div className="mx-auto grid w-full max-w-3xl gap-5">
    <section className="grid gap-2" aria-label="Versions">
      <SectionHeading action={hasPublishPermission && hasPublishedDoc && unpublishedVersionCount > 0 && history.data?.current ? <Button type="button" size="sm" variant="outline" disabled={!canRestore} onClick={() => openRestore({ version: history.data!.current!, discard: true })}>Discard unpublished changes…</Button> : null}>Versions</SectionHeading>
      {hasPublishedDoc && unpublishedVersionCount > 0 ? <p className="text-sm text-muted-foreground">The published story has unpublished changes.</p> : null}
      {history.isError ? <p className="text-sm" role="status">Versions are unavailable for this story or your account. <Button type="button" size="xs" variant="outline" onClick={() => void history.refetch()}>Retry</Button></p> : history.isPending ? <p role="status" className="text-sm">Loading versions…</p> : !history.data.versions.length ? <p className="text-sm text-muted-foreground">No saved versions yet.</p> : null}
      <ItemGroup className="gap-2">
        {groups(history.data?.versions ?? []).map((entries) => entries.length === 1 ? row(entries[0]) : <Collapsible key={entries[0].id}>
          <CollapsibleTrigger render={<Button type="button" size="sm" variant="ghost" className="w-full justify-start" />}>
            <ChevronDown aria-hidden="true" /> {entries.length} autosaves · {formatDay(entries[0].at, context.timeZone)}
          </CollapsibleTrigger>
          <CollapsibleContent><ItemGroup className="gap-2 p-2">{entries.map(row)}</ItemGroup></CollapsibleContent>
        </Collapsible>)}
      </ItemGroup>
    </section>
    {hasPublishedDoc ? <StoryFrontPage context={context} /> : null}
    {hasPublishedDoc ? <StoryDistribution context={context} /> : null}
    {hasPublishPermission && !context.readOnly ? <StoryCorrections context={context} /> : null}
    <AlertDialog open={restoring !== null} onOpenChange={(open) => { if (!open && !busy) setRestoring(null); }}>
      <AlertDialogContent finalFocus={() => focus.current?.isConnected ? focus.current : true}>
        <AlertDialogHeader><AlertDialogTitle>{restoring?.discard ? "Discard unpublished changes?" : "Restore this version?"}</AlertDialogTitle>
          <AlertDialogDescription>{restoring?.discard ? "The current draft will match the published story. Earlier work will still be available in Versions." : "This version will replace the current draft. The public story and the planning records will stay as they are."}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter><AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel><Button type="button" disabled={!canRestore || busy} onClick={() => void restore()}>{busy ? "Restoring…" : restoring?.discard ? "Discard changes" : "Restore draft"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
