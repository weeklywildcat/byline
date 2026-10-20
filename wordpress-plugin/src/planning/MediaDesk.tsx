import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Image as ImageIcon, ImagePlus, LayoutDashboard, MoreHorizontal, Paperclip, Search, Star, X } from "lucide-react";
import { __ } from "@wordpress/i18n";
import { toast } from "sonner";
import { InlineAlert } from "../admin-ui/components/inline-alert";
import { PeopleAvatars } from "../admin-ui/components/people-avatars";
import { DatePicker, valueSelectTriggerClass } from "../admin-ui/components/pickers";
import { StatusBadge } from "../admin-ui/components/status-badge";
import { WorkStatusBadge, mediaIntensity, workBadgeColors } from "../admin-ui/components/work-status-badge";
import { cn } from "../admin-ui/lib/utils";
import { useElementWidth } from "../admin-ui/lib/hooks";
import { decodeEntities } from "../admin-ui/lib/text";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "../admin-ui/ui/attachment";
import { Badge } from "../admin-ui/ui/badge";
import { Button, buttonVariants } from "../admin-ui/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../admin-ui/ui/dropdown-menu";
import { Input } from "../admin-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../admin-ui/ui/input-group";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "../admin-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../admin-ui/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../admin-ui/ui/table";
import { mediaLibraryAvailable, pickFromMediaLibrary } from "../workspace/media-library";
import { invalidateStoryData, mediaDeskKey } from "../story/story-query";
import type { PlanningFetchers } from "./planning-api";
import { EMPTY_MEDIA_DESK_FILTERS, MEDIA_STATUS_OPTIONS, MEDIA_TYPE_OPTIONS, filterMediaRows, mediaDeskRows, mediaDueDay, mediaReadinessHint, mediaTypeLabel, sortMediaRows, type MediaDeskFilters, type MediaDeskRow } from "./media-desk-model";
import { describeMediaDeskError } from "./media-desk-errors";
import { mergeMediaAttachmentIds, removeMediaAttachmentId, type MediaAttachment, type MediaDeskResponse } from "./planning-model";
import { NothingHere, PageHeader, ResourceGate } from "./PlanningPage";
import { useOptionalQuery } from "./planning-query";

export type MediaDeskProps = { fetchers: PlanningFetchers; workspaceUrl: (storyId: number, appointmentId?: string) => string; onOpenStory: (storyId: number) => void };

const ANY = "__any";
const rowKey = (row: MediaDeskRow) => `${row.story.id}:${row.id}`;

type Update = (row: MediaDeskRow, changes: Record<string, unknown>, options?: { featured?: boolean }) => void;

/** The linked files of one assignment: native Attachments, with the file actions a producer needs. */
function MediaFiles({ row, editable, saving, update }: { row: MediaDeskRow; editable: boolean; saving: boolean; update: Update }) {
  const attachments: MediaAttachment[] = row.attachments?.length ? row.attachments : row.attachmentIds.map((id) => ({ id }));
  const featuredId = row.featuredAttachmentId || row.mediaReadiness?.featuredAttachmentId || 0;
  const hint = mediaReadinessHint(row);
  const link = async () => {
    const picked = await pickFromMediaLibrary(row.type === "none" ? "other" : row.type);
    if (picked.length) update(row, { attachmentIds: mergeMediaAttachmentIds(row.attachmentIds, picked.map((file) => file.id)) });
  };
  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-auto gap-1.5 px-2 py-1 font-normal" aria-label={`${__("Files for", "weekly-wildcat-headless")} ${row.title || mediaTypeLabel(row.type)}`} />}>
      <Paperclip aria-hidden="true" />{row.attachmentIds.length ? `${row.attachmentIds.length}` : __("None", "weekly-wildcat-headless")}
      <StatusBadge tone={hint.tone === "warning" ? "attention" : hint.tone === "success" ? "done" : "neutral"} className="max-w-36 truncate">{hint.label}</StatusBadge>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-96 gap-3">
      {row.invalidAttachmentIds?.length ? <InlineAlert>{__("Some linked media is no longer available. Relink the assignment.", "weekly-wildcat-headless")}</InlineAlert> : null}
      {attachments.length
        ? <AttachmentGroup className="flex-col gap-2 overflow-visible py-0" role="group" aria-label={__("Linked files", "weekly-wildcat-headless")}>{attachments.map((file) => {
          const checks = file.checks;
          const missing = checks ? [!checks.alt && __("alt text", "weekly-wildcat-headless"), !checks.credit && __("credit", "weekly-wildcat-headless"), !checks.rights && __("rights", "weekly-wildcat-headless")].filter(Boolean) : [];
          return <Attachment key={file.id} size="sm" className="w-full">
            <AttachmentMedia variant={file.previewUrl ? "image" : "icon"}>{file.previewUrl ? <img src={file.previewUrl} alt="" loading="lazy" /> : <ImageIcon aria-hidden="true" />}</AttachmentMedia>
            <AttachmentContent><AttachmentTitle>{file.title || `${__("File", "weekly-wildcat-headless")} ${file.id}`}</AttachmentTitle><AttachmentDescription>{featuredId === file.id ? `${__("Featured", "weekly-wildcat-headless")} · ` : ""}{checks ? (missing.length ? `${__("Missing", "weekly-wildcat-headless")} ${missing.join(", ")}` : __("Metadata ready", "weekly-wildcat-headless")) : `#${file.id}`}</AttachmentDescription></AttachmentContent>
            <AttachmentActions>
              {file.isImage && row.isPrimary ? <AttachmentAction type="button" aria-label={`${__("Set featured", "weekly-wildcat-headless")}: ${file.title || file.id}`} aria-pressed={featuredId === file.id} disabled={!editable || saving} onClick={() => update(row, { featuredAttachmentId: file.id }, { featured: true })}><Star aria-hidden="true" className={featuredId === file.id ? "fill-current" : undefined} /></AttachmentAction> : null}
              <AttachmentAction type="button" aria-label={`${__("Unlink", "weekly-wildcat-headless")} ${file.title || file.id}`} disabled={!editable || saving} onClick={() => update(row, { attachmentIds: removeMediaAttachmentId(row.attachmentIds, file.id) })}><X aria-hidden="true" /></AttachmentAction>
            </AttachmentActions>
          </Attachment>;
        })}</AttachmentGroup>
        : <p className="text-sm text-muted-foreground">{__("No files linked yet.", "weekly-wildcat-headless")}</p>}
      {mediaLibraryAvailable() ? <Button variant="outline" size="sm" disabled={!editable || saving} onClick={() => void link()}><ImagePlus data-icon="inline-start" aria-hidden="true" />{__("Link from Media Library", "weekly-wildcat-headless")}</Button> : <p className="text-xs text-muted-foreground">{__("Upload files in the Media Library, then link them here.", "weekly-wildcat-headless")}</p>}
    </PopoverContent>
  </Popover>;
}

function RowMenu({ row, editable, saving, workspaceUrl, update }: { row: MediaDeskRow; editable: boolean; saving: boolean; workspaceUrl: MediaDeskProps["workspaceUrl"]; update: Update }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${__("Actions for", "weekly-wildcat-headless")} ${row.title || mediaTypeLabel(row.type)}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuItem render={<a href={workspaceUrl(row.story.id)} />}><LayoutDashboard aria-hidden="true" />{__("Open story workspace", "weekly-wildcat-headless")}</DropdownMenuItem>
      {row.status !== "done" ? <DropdownMenuItem disabled={!editable || saving} onClick={() => update(row, { status: "done" })}><CheckCheck aria-hidden="true" />{__("Mark complete", "weekly-wildcat-headless")}</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function MediaDeskContent({ data, fetchers, workspaceUrl, onOpenStory }: MediaDeskProps & { data: MediaDeskResponse }) {
  const client = useQueryClient();
  const [filters, setFilters] = useState<MediaDeskFilters>(EMPTY_MEDIA_DESK_FILTERS);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const timezone = data.timezone || "UTC";
  const assignees = data.assignees || [];
  const canManage = data.capabilities?.canManageMedia !== false;
  const canAssign = data.capabilities?.canAssign !== false;
  const rows = useMemo(() => mediaDeskRows(data), [data]);
  const visible = useMemo(() => sortMediaRows(filterMediaRows(rows, filters, data.timezone), data.timezone), [data.timezone, filters, rows]);
  const set = <K extends keyof MediaDeskFilters>(key: K, value: MediaDeskFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_MEDIA_DESK_FILTERS);
  const canUpdate = (row: MediaDeskRow) => row.source === "assignment" ? Boolean(fetchers.updateMediaAssignment) : Boolean(fetchers.updateMediaRequest);

  // Assignment rows write to their own assignment. The story-level featured image, and the
  // legacy one-request-per-story collection, still go through the per-story route.
  const mutation = useMutation({
    mutationFn: async ({ row, changes, featured }: { row: MediaDeskRow; changes: Record<string, unknown>; featured?: boolean }) => {
      if (featured && fetchers.updateMediaRequest) return fetchers.updateMediaRequest(row.story.id, changes);
      if (row.source === "assignment" && fetchers.updateMediaAssignment) return fetchers.updateMediaAssignment(row.story.id, row.id, changes);
      if (fetchers.updateMediaRequest) return fetchers.updateMediaRequest(row.story.id, changes);
      throw new Error(__("The protected media update API is not available in this install.", "weekly-wildcat-headless"));
    },
    onError: (error) => toast.error(describeMediaDeskError(error)),
    onSettled: (_data, _error, variables) => { void client.invalidateQueries({ queryKey: mediaDeskKey }); void invalidateStoryData(client, variables?.row.story.id); }
  });
  const savingKey = mutation.isPending && mutation.variables ? rowKey(mutation.variables.row) : null;
  const update: Update = (row, changes, options) => mutation.mutate({ row, changes, featured: options?.featured });

  const typeItems = [{ value: ANY, label: __("All types", "weekly-wildcat-headless") }, ...MEDIA_TYPE_OPTIONS];
  const statusItems = [{ value: ANY, label: __("All statuses", "weekly-wildcat-headless") }, ...MEDIA_STATUS_OPTIONS];
  const assigneeFilterItems = [{ value: ANY, label: __("Everyone", "weekly-wildcat-headless") }, ...assignees.map((person) => ({ value: String(person.id), label: person.name }))];
  const assigneeItems = [{ value: "0", label: __("Unassigned", "weekly-wildcat-headless") }, ...assignees.map((person) => ({ value: String(person.id), label: person.name }))];

  const cells = (row: MediaDeskRow) => {
    const editable = canManage && canUpdate(row);
    const saving = savingKey === rowKey(row);
    return {
      editable, saving,
      status: editable
        ? <Select items={MEDIA_STATUS_OPTIONS} value={row.status} disabled={saving} onValueChange={(value) => { if (value && value !== row.status) update(row, { status: String(value) }); }}><SelectTrigger aria-label={`${__("Status", "weekly-wildcat-headless")}: ${row.title || mediaTypeLabel(row.type)}`} className={cn(valueSelectTriggerClass, workBadgeColors.production[mediaIntensity(row.status)])}><SelectValue /></SelectTrigger><SelectContent>{MEDIA_STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        : <WorkStatusBadge kind="production" intensity={mediaIntensity(row.status)}>{MEDIA_STATUS_OPTIONS.find((item) => item.value === row.status)?.label || row.status}</WorkStatusBadge>,
      assignee: editable && canAssign
        ? <Select items={assigneeItems} value={String(row.assignee?.id || 0)} disabled={saving} onValueChange={(value) => { if (value !== undefined && String(value) !== String(row.assignee?.id || 0)) update(row, { assigneeId: Number(value) }); }}><SelectTrigger aria-label={`${__("Assignee", "weekly-wildcat-headless")}: ${row.title || mediaTypeLabel(row.type)}`} className={valueSelectTriggerClass}><SelectValue /></SelectTrigger><SelectContent>{assigneeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        : <span className="flex items-center gap-2">{row.assignee ? <><PeopleAvatars people={[row.assignee]} />{row.assignee.name}</> : <span className="text-muted-foreground">{__("Unassigned", "weekly-wildcat-headless")}</span>}</span>,
      due: editable
        ? <DatePicker appearance="value" dateOnly label={`${__("due date", "weekly-wildcat-headless")}: ${row.title || mediaTypeLabel(row.type)}`} value={mediaDueDay(row.dueAt, data.timezone) || null} timezone={timezone} disabled={saving} placeholder={__("No due date", "weekly-wildcat-headless")} onChange={(dueAt) => update(row, { dueAt })} />
        : <span className={row.dueAt ? undefined : "text-muted-foreground"}>{row.dueAt ? mediaDueDay(row.dueAt, data.timezone) : __("No due date", "weekly-wildcat-headless")}</span>
    };
  };

  const story = (row: MediaDeskRow) => <button type="button" className="text-left hover:underline" onClick={() => onOpenStory(row.story.id)}>{decodeEntities(row.story.title) || __("Untitled story", "weekly-wildcat-headless")}</button>;
  const table = width === 0 || width >= 860;

  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center gap-2" role="search" aria-label={__("Filter assignments", "weekly-wildcat-headless")}>
      <InputGroup className="min-w-60 flex-1 sm:max-w-sm">
        <InputGroupInput type="search" aria-label={__("Find a story or assignment", "weekly-wildcat-headless")} placeholder={__("Find a story or assignment…", "weekly-wildcat-headless")} value={filters.story} onChange={(event) => set("story", event.target.value)} />
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
      </InputGroup>
      <Select items={typeItems} value={filters.type || ANY} onValueChange={(value) => set("type", !value || value === ANY ? "" : value as MediaDeskFilters["type"])}><SelectTrigger aria-label={__("Type", "weekly-wildcat-headless")} className="w-32"><SelectValue /></SelectTrigger><SelectContent>{typeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
      <Select items={statusItems} value={filters.status || ANY} onValueChange={(value) => set("status", !value || value === ANY ? "" : value as MediaDeskFilters["status"])}><SelectTrigger aria-label={__("Status", "weekly-wildcat-headless")} className="w-36"><SelectValue /></SelectTrigger><SelectContent>{statusItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
      <Select items={assigneeFilterItems} value={filters.assigneeId || ANY} onValueChange={(value) => set("assigneeId", !value || value === ANY ? "" : String(value))}><SelectTrigger aria-label={__("Assignee", "weekly-wildcat-headless")} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{assigneeFilterItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
      <Popover>
        <PopoverTrigger render={<Button variant="outline" />}>{__("Due date", "weekly-wildcat-headless")}{filters.dueFrom || filters.dueTo ? <Badge variant="secondary" className="ml-1">1</Badge> : null}</PopoverTrigger>
        <PopoverContent align="start" className="w-72 gap-2">
          <label className="grid gap-1 text-sm">{__("Due from", "weekly-wildcat-headless")}<Input type="date" value={filters.dueFrom} onChange={(event) => set("dueFrom", event.target.value)} /></label>
          <label className="grid gap-1 text-sm">{__("Due to", "weekly-wildcat-headless")}<Input type="date" value={filters.dueTo} onChange={(event) => set("dueTo", event.target.value)} /></label>
        </PopoverContent>
      </Popover>
      {active ? <Button variant="ghost" onClick={() => setFilters(EMPTY_MEDIA_DESK_FILTERS)}>{__("Clear", "weekly-wildcat-headless")}</Button> : null}
    </div>

    {!visible.length
      ? <NothingHere title={rows.length ? __("No assignments match", "weekly-wildcat-headless") : __("No production assignments yet", "weekly-wildcat-headless")} description={rows.length ? __("Try clearing a filter.", "weekly-wildcat-headless") : __("Photo, video, graphic and audio work appears here once it is assigned from a story.", "weekly-wildcat-headless")} />
      : <div ref={ref} className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {table
          ? <Table aria-label={__("Production assignments", "weekly-wildcat-headless")}>
            <TableHeader className="bg-muted/20"><TableRow className="hover:bg-transparent"><TableHead>{__("Assignment", "weekly-wildcat-headless")}</TableHead><TableHead>{__("Story", "weekly-wildcat-headless")}</TableHead><TableHead>{__("Assignee", "weekly-wildcat-headless")}</TableHead><TableHead>{__("Due", "weekly-wildcat-headless")}</TableHead><TableHead>{__("Status", "weekly-wildcat-headless")}</TableHead><TableHead>{__("Files", "weekly-wildcat-headless")}</TableHead><TableHead className="w-10"><span className="sr-only">{__("Actions", "weekly-wildcat-headless")}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visible.map((row) => {
              const c = cells(row);
              return <TableRow key={rowKey(row)} aria-busy={c.saving || undefined} className="h-16">
                <TableCell className="py-3 whitespace-normal"><span className="font-semibold">{row.title || mediaTypeLabel(row.type)}</span><span className="block text-xs text-muted-foreground">{mediaTypeLabel(row.type)}</span></TableCell>
                <TableCell className="py-3 whitespace-normal">{story(row)}</TableCell>
                <TableCell className="py-3">{c.assignee}</TableCell>
                <TableCell className="py-3">{c.due}</TableCell>
                <TableCell className="py-3">{c.status}</TableCell>
                <TableCell className="py-3"><MediaFiles row={row} editable={c.editable} saving={c.saving} update={update} /></TableCell>
                <TableCell className="py-3 text-right"><RowMenu row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} update={update} /></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
          : <ItemGroup className="gap-0" aria-label={__("Production assignments", "weekly-wildcat-headless")}>{visible.map((row) => {
            const c = cells(row);
            return <Item key={rowKey(row)} size="sm" className="rounded-none border-b last:border-b-0" aria-busy={c.saving || undefined}>
              <ItemMedia variant="icon" aria-hidden="true"><ImageIcon /></ItemMedia>
              <ItemContent>
                <ItemTitle>{row.title || mediaTypeLabel(row.type)}</ItemTitle>
                <div className="text-sm text-muted-foreground">{story(row)} · {mediaTypeLabel(row.type)}</div>
                <div className="flex flex-wrap items-center gap-x-3 text-sm">{c.assignee}{c.due}</div>
                <MediaFiles row={row} editable={c.editable} saving={c.saving} update={update} />
              </ItemContent>
              <ItemActions>{c.status}<RowMenu row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} update={update} /></ItemActions>
            </Item>;
          })}</ItemGroup>}
      </div>}
  </div>;
}

export function MediaDesk(props: MediaDeskProps) {
  const query = useOptionalQuery<MediaDeskResponse>(mediaDeskKey, props.fetchers.getMediaDesk ? () => props.fetchers.getMediaDesk!() : undefined, __("Media Desk", "weekly-wildcat-headless"));
  return <>
    <PageHeader title={__("Media Desk", "weekly-wildcat-headless")} description={__("Every photo, video, graphic and audio assignment across the newsroom. Files stay in the WordPress Media Library.", "weekly-wildcat-headless")} />
    <ResourceGate query={query} label={__("Media Desk", "weekly-wildcat-headless")}>{(data) => <MediaDeskContent {...props} data={data} />}</ResourceGate>
  </>;
}
