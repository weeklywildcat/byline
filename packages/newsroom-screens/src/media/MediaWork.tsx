import { useMemo, useState, type ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Eye, Image as ImageIcon, ImagePlus, LayoutDashboard, MoreHorizontal, Paperclip, RotateCcw, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { toast } from "sonner";
import { DateRangeButton } from "@byline/newsroom-ui/components/date-fields";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { PeopleAvatars } from "@byline/newsroom-ui/components/people-avatars";
import { DatePicker, valueSelectTriggerClass } from "../editorial/pickers";
import { StatusBadge } from "@byline/newsroom-ui/components/status-badge";
import { WorkStatusBadge, mediaIntensity, workBadgeColors } from "@byline/newsroom-ui/components/work-status-badge";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { useElementWidth } from "@byline/newsroom-ui/lib/hooks";
import { Attachment, AttachmentAction, AttachmentActions, AttachmentContent, AttachmentDescription, AttachmentGroup, AttachmentMedia, AttachmentTitle } from "@byline/newsroom-ui/ui/attachment";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button, buttonVariants } from "@byline/newsroom-ui/ui/button";
import { Card } from "@byline/newsroom-ui/ui/card";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { Field, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@byline/newsroom-ui/ui/context-menu";
import { Input } from "@byline/newsroom-ui/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@byline/newsroom-ui/ui/input-group";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@byline/newsroom-ui/ui/table";
import type { MediaPicker } from "../workspace/media-picker";
import { invalidateStoryData, mediaDeskKey } from "../story/story-query";
import { StoryTitleButton } from "../story/story-parts";
import { StoryHoverCard } from "../story/StoryHoverCard";
import type { PlanningFetchers } from "../planning/planning-api";
import { EMPTY_MEDIA_DESK_FILTERS, MEDIA_STATUS_OPTIONS, MEDIA_TYPE_OPTIONS, MEDIA_WORK_SCOPES, filterMediaRows, mediaDeskRows, mediaDueDay, mediaReadinessHint, mediaTypeLabel, scopeMediaRows, sortMediaRows, type MediaDeskFilters, type MediaDeskRow, type MediaWorkScope } from "./media-desk-model";
import { describeMediaDeskError } from "./media-desk-errors";
import { mergeMediaAttachmentIds, removeMediaAttachmentId, type MediaAttachment, type MediaDeskResponse } from "../planning/planning-model";
import { NothingHere, ResourceGate } from "../planning/PlanningPage";
import { siteDay } from "../home/newsroom-model";
import { useOptionalQuery } from "../planning/planning-query";

export type MediaWorkProps = {
  fetchers: PlanningFetchers;
  workspaceUrl: (storyId: number, appointmentId?: string) => string;
  onOpenStory: (storyId: number) => void;
  /** Choosing files to link (the WordPress Media Library, Byline's Media picker); absent, the desk offers no "Link" button. */
  media?: MediaPicker;
  /** A Work view from the host's navigator. Default: every assignment. */
  scope?: MediaWorkScope;
  /** The signed-in account, for "My assignments". */
  currentUserId?: number | null;
  /** Client navigation for "Open story workspace" (the host's guarded router); absent, links navigate natively. */
  navigate?: (href: string) => void;
  /** Today's newsroom day (tests); defaults to now in the newsroom timezone. */
  today?: string;
};

const ANY = "__any";
const rowKey = (row: MediaDeskRow) => `${row.story.id}:${row.id}`;

type Update = (row: MediaDeskRow, changes: Record<string, unknown>, options?: { featured?: boolean }) => void;

/** The linked files of one assignment: native Attachments, with the file actions a producer needs. */
function MediaFiles({ row, editable, saving, update, media, canFeature }: { row: MediaDeskRow; editable: boolean; saving: boolean; update: Update; media?: MediaPicker; canFeature: boolean }) {
  const attachments: MediaAttachment[] = row.attachments?.length ? row.attachments : row.attachmentIds.map((id) => ({ id }));
  const featuredId = row.featuredAttachmentId || row.mediaReadiness?.featuredAttachmentId || 0;
  const hint = mediaReadinessHint(row);
  const link = async () => {
    if (!media) return;
    const picked = await media.pick(row.type === "none" ? "other" : row.type, { title: `Link files to ${row.title || mediaTypeLabel(row.type)}`, buttonLabel: "Link files", multiple: true });
    if (picked.length) update(row, { attachmentIds: mergeMediaAttachmentIds(row.attachmentIds, picked.map((file) => file.id)) });
  };
  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" size="sm" className="-ml-2 h-auto gap-1.5 px-2 py-1 font-normal" aria-label={`${"Files for"} ${row.title || mediaTypeLabel(row.type)}`} />}>
      <Paperclip aria-hidden="true" />{row.attachmentIds.length ? `${row.attachmentIds.length}` : "None"}
      <StatusBadge tone={hint.tone === "warning" ? "attention" : hint.tone === "success" ? "done" : "neutral"} className="max-w-36 truncate">{hint.label}</StatusBadge>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-96 gap-3">
      {row.invalidAttachmentIds?.length ? <InlineAlert>{"Some linked media is no longer available. Relink the assignment."}</InlineAlert> : null}
      {attachments.length
        ? <AttachmentGroup className="flex-col gap-2 overflow-visible py-0" role="group" aria-label={"Linked files"}>{attachments.map((file) => {
          const checks = file.checks;
          const missing = checks ? [!checks.alt && "alt text", !checks.credit && "credit", !checks.rights && "rights"].filter(Boolean) : [];
          return <Attachment key={file.id} size="sm" className="w-full">
            <AttachmentMedia variant={file.previewUrl ? "image" : "icon"}>{file.previewUrl ? <img src={file.previewUrl} alt="" loading="lazy" /> : <ImageIcon aria-hidden="true" />}</AttachmentMedia>
            <AttachmentContent><AttachmentTitle>{file.title || `${"File"} ${file.id}`}</AttachmentTitle><AttachmentDescription>{featuredId === file.id ? `${"Featured"} · ` : ""}{checks ? (missing.length ? `${"Missing"} ${missing.join(", ")}` : "Metadata ready") : `#${file.id}`}</AttachmentDescription></AttachmentContent>
            <AttachmentActions>
              {canFeature && file.isImage && row.isPrimary ? <AttachmentAction type="button" aria-label={`${"Set featured"}: ${file.title || file.id}`} aria-pressed={featuredId === file.id} disabled={!editable || saving} onClick={() => update(row, { featuredAttachmentId: file.id }, { featured: true })}><Star aria-hidden="true" className={featuredId === file.id ? "fill-current" : undefined} /></AttachmentAction> : null}
              <AttachmentAction type="button" aria-label={`${"Unlink"} ${file.title || file.id}`} disabled={!editable || saving} onClick={() => update(row, { attachmentIds: removeMediaAttachmentId(row.attachmentIds, file.id) })}><X aria-hidden="true" /></AttachmentAction>
            </AttachmentActions>
          </Attachment>;
        })}</AttachmentGroup>
        : <p className="text-sm text-muted-foreground">{"No files linked yet."}</p>}
      {media?.available() ? <Button variant="outline" size="sm" disabled={!editable || saving} onClick={() => void link()}><ImagePlus data-icon="inline-start" aria-hidden="true" />{media.label}</Button> : <p className="text-xs text-muted-foreground">{media?.unavailableHint || "Upload files to Media, then link them here."}</p>}
    </PopoverContent>
  </Popover>;
}

/** A link to a story's workspace that uses the host's client navigation when it has one. */
function workspaceLink(href: string, navigate?: (href: string) => void) {
  return <a href={href} onClick={navigate ? (event) => { if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(href); } } : undefined} />;
}

function RowMenu({ row, editable, saving, workspaceUrl, update, navigate }: { row: MediaDeskRow; editable: boolean; saving: boolean; workspaceUrl: MediaWorkProps["workspaceUrl"]; update: Update; navigate?: MediaWorkProps["navigate"] }) {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${"Actions for"} ${row.title || mediaTypeLabel(row.type)}`} />}><MoreHorizontal aria-hidden="true" /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-52">
      <DropdownMenuItem render={workspaceLink(workspaceUrl(row.story.id), navigate)}><LayoutDashboard aria-hidden="true" />{"Open story workspace"}</DropdownMenuItem>
      {editable ? <DropdownMenuItem disabled={saving} onClick={() => update(row, { status: row.status === "done" ? "in-progress" : "done" })}>{row.status === "done" ? <RotateCcw aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}{row.status === "done" ? "Reopen assignment" : "Mark complete"}</DropdownMenuItem> : null}
    </DropdownMenuContent>
  </DropdownMenu>;
}

function MediaRowContext({ row, editable, saving, workspaceUrl, onOpenStory, update, navigate, children }: { row: MediaDeskRow; editable: boolean; saving: boolean; workspaceUrl: MediaWorkProps["workspaceUrl"]; onOpenStory: MediaWorkProps["onOpenStory"]; update: Update; navigate?: MediaWorkProps["navigate"]; children: ReactElement }) {
  const title = row.title || mediaTypeLabel(row.type);
  return <ContextMenu>
    <ContextMenuTrigger render={children} />
    <ContextMenuContent className="w-56">
      <ContextMenuGroup>
        <ContextMenuLabel className="max-w-52 truncate">{title}</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onOpenStory(row.story.id)}><Eye aria-hidden="true" />{"Quick view story"}</ContextMenuItem>
        <ContextMenuItem render={workspaceLink(workspaceUrl(row.story.id), navigate)}><LayoutDashboard aria-hidden="true" />{"Open story workspace"}</ContextMenuItem>
      </ContextMenuGroup>
      {editable ? <>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={saving}>{"Status"}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="min-w-44">
            <ContextMenuRadioGroup value={row.status} onValueChange={(value) => { if (value && value !== row.status) update(row, { status: String(value) }); }}>
              {MEDIA_STATUS_OPTIONS.map((item) => <ContextMenuRadioItem key={item.value} value={item.value}>{item.label}</ContextMenuRadioItem>)}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem disabled={saving} onClick={() => update(row, { status: row.status === "done" ? "in-progress" : "done" })}>{row.status === "done" ? <RotateCcw aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}{row.status === "done" ? "Reopen assignment" : "Mark complete"}</ContextMenuItem>
      </> : null}
    </ContextMenuContent>
  </ContextMenu>;
}

function MediaDeskContent({ data, fetchers, workspaceUrl, onOpenStory, media, scope = "all", currentUserId = null, navigate, today }: MediaWorkProps & { data: MediaDeskResponse }) {
  const client = useQueryClient();
  const [filters, setFilters] = useState<MediaDeskFilters>(EMPTY_MEDIA_DESK_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const timezone = data.timezone || "UTC";
  const assignees = data.assignees || [];
  const canManage = data.capabilities?.canManageMedia !== false;
  const canAssign = data.capabilities?.canAssign !== false;
  const day = today || siteDay(new Date(), timezone);
  const rows = useMemo(() => scopeMediaRows(mediaDeskRows(data), scope, { currentUserId, today: day, timezone: data.timezone }), [currentUserId, data, day, scope]);
  const scopeLabel = MEDIA_WORK_SCOPES.find((item) => item.value === scope)?.label ?? "All assignments";
  const canFeature = Boolean(fetchers.updateMediaRequest);
  const visible = useMemo(() => sortMediaRows(filterMediaRows(rows, filters, data.timezone), data.timezone), [data.timezone, filters, rows]);
  const set = <K extends keyof MediaDeskFilters>(key: K, value: MediaDeskFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const active = JSON.stringify(filters) !== JSON.stringify(EMPTY_MEDIA_DESK_FILTERS);
  const filterCount = [filters.type, filters.status, filters.assigneeId, filters.dueFrom || filters.dueTo].filter(Boolean).length;
  const compactFilters = width > 0 && width < 700;
  const canUpdate = (row: MediaDeskRow) => row.source === "assignment" ? Boolean(fetchers.updateMediaAssignment) : Boolean(fetchers.updateMediaRequest);

  // Assignment rows write to their own assignment. The story-level featured image, and the
  // legacy one-request-per-story collection, still go through the per-story route.
  const mutation = useMutation({
    mutationFn: async ({ row, changes, featured }: { row: MediaDeskRow; changes: Record<string, unknown>; featured?: boolean }) => {
      if (featured && fetchers.updateMediaRequest) return fetchers.updateMediaRequest(row.story.id, changes);
      if (row.source === "assignment" && fetchers.updateMediaAssignment) return fetchers.updateMediaAssignment(row.story.id, row.id, changes);
      if (fetchers.updateMediaRequest) return fetchers.updateMediaRequest(row.story.id, changes);
      throw new Error("Assignments can't be updated here.");
    },
    onMutate: async ({ row, changes }) => {
      await client.cancelQueries({ queryKey: mediaDeskKey });
      const previous = client.getQueryData<MediaDeskResponse>(mediaDeskKey);
      const patch = <T extends { status: string; assignee: MediaDeskRow["assignee"]; dueAt: string | null; attachmentIds: number[]; featuredAttachmentId?: number | null }>(item: T): T => {
        const assignee = Object.prototype.hasOwnProperty.call(changes, "assigneeId")
          ? assignees.find((person) => person.id === Number(changes.assigneeId)) || null
          : item.assignee;
        return {
          ...item,
          ...(Object.prototype.hasOwnProperty.call(changes, "status") ? { status: String(changes.status) } : {}),
          ...(Object.prototype.hasOwnProperty.call(changes, "dueAt") ? { dueAt: changes.dueAt ? String(changes.dueAt) : null } : {}),
          ...(Object.prototype.hasOwnProperty.call(changes, "attachmentIds") ? { attachmentIds: Array.isArray(changes.attachmentIds) ? changes.attachmentIds.map(Number) : item.attachmentIds } : {}),
          ...(Object.prototype.hasOwnProperty.call(changes, "featuredAttachmentId") ? { featuredAttachmentId: Number(changes.featuredAttachmentId) || null } : {}),
          assignee
        } as T;
      };
      client.setQueryData<MediaDeskResponse>(mediaDeskKey, (current) => {
        if (!current) return current;
        return {
          ...current,
          requests: current.requests.map((item) => row.source === "request" && item.story.id === row.story.id ? patch(item) : item),
          assignments: current.assignments?.map((item) => row.source === "assignment" && item.story.id === row.story.id && item.id === row.id ? patch(item) : item)
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) client.setQueryData(mediaDeskKey, context.previous);
      toast.error(describeMediaDeskError(error));
    },
    onSettled: (_data, _error, variables) => { void client.invalidateQueries({ queryKey: mediaDeskKey }); void invalidateStoryData(client, variables?.row.story.id); }
  });
  const savingKey = mutation.isPending && mutation.variables ? rowKey(mutation.variables.row) : null;
  const update: Update = (row, changes, options) => mutation.mutate({ row, changes, featured: options?.featured });

  const typeItems = [{ value: ANY, label: "All types" }, ...MEDIA_TYPE_OPTIONS];
  const statusItems = [{ value: ANY, label: "All statuses" }, ...MEDIA_STATUS_OPTIONS];
  const assigneeFilterItems = [{ value: ANY, label: "Everyone" }, ...assignees.map((person) => ({ value: String(person.id), label: person.name }))];
  const assigneeItems = [{ value: "0", label: "Unassigned" }, ...assignees.map((person) => ({ value: String(person.id), label: person.name }))];

  const cells = (row: MediaDeskRow) => {
    const editable = canUpdate(row) && (canManage || (currentUserId !== null && row.assignee?.id === currentUserId));
    const saving = savingKey === rowKey(row);
    return {
      editable, saving,
      status: editable
        ? <Select items={MEDIA_STATUS_OPTIONS} value={row.status} disabled={saving} onValueChange={(value) => { if (value && value !== row.status) update(row, { status: String(value) }); }}><SelectTrigger aria-label={`${"Status"}: ${row.title || mediaTypeLabel(row.type)}`} className={cn(valueSelectTriggerClass, workBadgeColors.production[mediaIntensity(row.status)])}><SelectValue /></SelectTrigger><SelectContent>{MEDIA_STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        : <WorkStatusBadge kind="production" intensity={mediaIntensity(row.status)}>{MEDIA_STATUS_OPTIONS.find((item) => item.value === row.status)?.label || row.status}</WorkStatusBadge>,
      assignee: editable && canAssign
        ? <Select items={assigneeItems} value={String(row.assignee?.id || 0)} disabled={saving} onValueChange={(value) => { if (value !== undefined && String(value) !== String(row.assignee?.id || 0)) update(row, { assigneeId: Number(value) }); }}><SelectTrigger aria-label={`${"Assignee"}: ${row.title || mediaTypeLabel(row.type)}`} className={valueSelectTriggerClass}><SelectValue /></SelectTrigger><SelectContent>{assigneeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
        : <span className="flex items-center gap-2">{row.assignee ? <><PeopleAvatars people={[row.assignee]} />{row.assignee.name}</> : <span className="text-muted-foreground">{"Unassigned"}</span>}</span>,
      due: editable
        ? <DatePicker appearance="value" dateOnly label={`${"due date"}: ${row.title || mediaTypeLabel(row.type)}`} value={mediaDueDay(row.dueAt, data.timezone) || null} timezone={timezone} disabled={saving} placeholder={"No due date"} onChange={(dueAt) => update(row, { dueAt })} />
        : <span className={row.dueAt ? undefined : "text-muted-foreground"}>{row.dueAt ? mediaDueDay(row.dueAt, data.timezone) : "No due date"}</span>
    };
  };

  const story = (row: MediaDeskRow) => <StoryHoverCard storyId={row.story.id} title={row.story.title}><StoryTitleButton story={row.story} onOpen={onOpenStory} className="font-normal" /></StoryHoverCard>;
  const table = width === 0 || width >= 860;

  const filterControls = <>
    <Field>
      <FieldLabel>Type</FieldLabel>
      <Select items={typeItems} value={filters.type || ANY} onValueChange={(value) => set("type", !value || value === ANY ? "" : value as MediaDeskFilters["type"])}><SelectTrigger aria-label={"Type"} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{typeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
    </Field>
    <Field>
      <FieldLabel>Status</FieldLabel>
      <Select items={statusItems} value={filters.status || ANY} onValueChange={(value) => set("status", !value || value === ANY ? "" : value as MediaDeskFilters["status"])}><SelectTrigger aria-label={"Status"} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{statusItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
    </Field>
    <Field>
      <FieldLabel>Assignee</FieldLabel>
      <Select items={assigneeFilterItems} value={filters.assigneeId || ANY} onValueChange={(value) => set("assigneeId", !value || value === ANY ? "" : String(value))}><SelectTrigger aria-label={"Assignee"} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{assigneeFilterItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
    </Field>
    <Field>
      <FieldLabel>Due</FieldLabel>
      <DateRangeButton aria-label="Due date" className="w-full justify-start font-normal" placeholder="Any due date" today={day} presets={["today", "next7", "month"]} from={filters.dueFrom} to={filters.dueTo} onChange={(dueFrom, dueTo) => setFilters({ ...filters, dueFrom, dueTo })} />
    </Field>
  </>;

  return <div ref={ref} className="flex flex-col gap-3">
    <div className="flex items-center gap-2" role="search" aria-label={"Filter assignments"}>
      <InputGroup className="min-w-0 flex-1 sm:max-w-sm">
        <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
        <InputGroupInput type="search" aria-label={"Find a story or assignment"} placeholder={"Find a story or assignment…"} value={filters.story} onChange={(event) => set("story", event.target.value)} />
        {filters.story ? <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-xs" aria-label="Clear assignment search" onClick={() => set("story", "")}><X /></InputGroupButton></InputGroupAddon> : null}
      </InputGroup>
      {compactFilters ? (
        <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DrawerTrigger render={<Button type="button" variant="outline" className="shrink-0" />}>
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />Filters{filterCount ? <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 tabular-nums">{filterCount}</Badge> : null}
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filter assignments</DrawerTitle>
              <DrawerDescription>Narrow the Media desk without crowding the screen.</DrawerDescription>
            </DrawerHeader>
            <div className="grid gap-4 px-4">{filterControls}</div>
            <DrawerFooter className="flex-row">
              {filterCount ? <Button type="button" variant="ghost" className="flex-1" onClick={() => setFilters((current) => ({ ...current, type: "", status: "", assigneeId: "", dueFrom: "", dueTo: "" }))}>Clear filters</Button> : null}
              <DrawerClose render={<Button type="button" className="flex-1" />}>Done</DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Select items={typeItems} value={filters.type || ANY} onValueChange={(value) => set("type", !value || value === ANY ? "" : value as MediaDeskFilters["type"])}><SelectTrigger aria-label={"Type"} className="w-32"><SelectValue /></SelectTrigger><SelectContent>{typeItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <Select items={statusItems} value={filters.status || ANY} onValueChange={(value) => set("status", !value || value === ANY ? "" : value as MediaDeskFilters["status"])}><SelectTrigger aria-label={"Status"} className="w-36"><SelectValue /></SelectTrigger><SelectContent>{statusItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <Select items={assigneeFilterItems} value={filters.assigneeId || ANY} onValueChange={(value) => set("assigneeId", !value || value === ANY ? "" : String(value))}><SelectTrigger aria-label={"Assignee"} className="w-40"><SelectValue /></SelectTrigger><SelectContent>{assigneeFilterItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select>
          <DateRangeButton aria-label="Due date" className="w-auto justify-start font-normal" placeholder="Due date" today={day} presets={["today", "next7", "month"]} from={filters.dueFrom} to={filters.dueTo} onChange={(dueFrom, dueTo) => setFilters({ ...filters, dueFrom, dueTo })} />
          {active ? <Button variant="ghost" onClick={() => setFilters(EMPTY_MEDIA_DESK_FILTERS)}>{"Clear"}</Button> : null}
        </div>
      )}
    </div>

    {!visible.length
      ? <NothingHere title={rows.length ? "No assignments match" : scope === "all" ? "No production assignments yet" : `Nothing in ${scopeLabel}`} description={rows.length ? "Try clearing a filter." : scope === "all" ? "Photo, video, graphic and audio work appears here once it is assigned from a story." : "Assignments appear here as soon as they match this view."} />
      : <Card className="gap-0 py-0 shadow-xs">
        {table
          ? <Table aria-label={"Production assignments"}>
            <TableHeader className="bg-muted/20"><TableRow className="hover:bg-transparent"><TableHead>{"Assignment"}</TableHead><TableHead>{"Story"}</TableHead><TableHead>{"Assignee"}</TableHead><TableHead>{"Due"}</TableHead><TableHead>{"Status"}</TableHead><TableHead>{"Files"}</TableHead><TableHead className="w-10"><span className="sr-only">{"Actions"}</span></TableHead></TableRow></TableHeader>
            <TableBody>{visible.map((row) => {
              const c = cells(row);
              return <MediaRowContext key={rowKey(row)} row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory} update={update} navigate={navigate}>
                <TableRow aria-busy={c.saving || undefined} className="h-16">
                  <TableCell className="py-3 whitespace-normal"><span className="font-semibold">{row.title || mediaTypeLabel(row.type)}</span><span className="block text-xs text-muted-foreground">{mediaTypeLabel(row.type)}</span></TableCell>
                  <TableCell className="py-3 whitespace-normal">{story(row)}</TableCell>
                  <TableCell className="py-3">{c.assignee}</TableCell>
                  <TableCell className="py-3">{c.due}</TableCell>
                  <TableCell className="py-3">{c.status}</TableCell>
                  <TableCell className="py-3"><MediaFiles row={row} editable={c.editable} saving={c.saving} update={update} media={media} canFeature={canFeature} /></TableCell>
                  <TableCell className="py-3 text-right"><RowMenu row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} update={update} navigate={navigate} /></TableCell>
                </TableRow>
              </MediaRowContext>;
            })}</TableBody>
          </Table>
          : <ItemGroup className="gap-0" aria-label={"Production assignments"}>{visible.map((row) => {
            const c = cells(row);
            return <MediaRowContext key={rowKey(row)} row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} onOpenStory={onOpenStory} update={update} navigate={navigate}>
              <Item size="sm" className="rounded-none border-b last:border-b-0" aria-busy={c.saving || undefined}>
                <ItemMedia>
                  {c.editable
                    ? <Checkbox aria-label={row.status === "done" ? `Reopen ${row.title || mediaTypeLabel(row.type)}` : `Mark ${row.title || mediaTypeLabel(row.type)} complete`} checked={row.status === "done"} disabled={c.saving} onCheckedChange={(checked) => update(row, { status: checked ? "done" : "in-progress" })} />
                    : <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground"><ImageIcon className="size-4" aria-hidden="true" /></span>}
                </ItemMedia>
                <ItemContent className="gap-2">
                  <div>
                    <ItemTitle className={row.status === "done" ? "text-muted-foreground line-through" : undefined}>{row.title || mediaTypeLabel(row.type)}</ItemTitle>
                    <div className="text-sm text-muted-foreground">{story(row)} · {mediaTypeLabel(row.type)}</div>
                  </div>
                  <div className="grid gap-2 min-[480px]:grid-cols-2">
                    <div className="grid min-w-0 gap-1"><span className="text-xs font-medium text-muted-foreground">Assignee</span>{c.assignee}</div>
                    <div className="grid min-w-0 gap-1"><span className="text-xs font-medium text-muted-foreground">Due</span>{c.due}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <WorkStatusBadge kind="production" intensity={mediaIntensity(row.status)}>{MEDIA_STATUS_OPTIONS.find((item) => item.value === row.status)?.label || row.status}</WorkStatusBadge>
                    <MediaFiles row={row} editable={c.editable} saving={c.saving} update={update} media={media} canFeature={canFeature} />
                  </div>
                </ItemContent>
                <ItemActions><RowMenu row={row} editable={c.editable} saving={c.saving} workspaceUrl={workspaceUrl} update={update} navigate={navigate} /></ItemActions>
              </Item>
            </MediaRowContext>;
          })}</ItemGroup>}
      </Card>}
  </div>;
}

/**
 * Media Work: every photo, gallery, graphic, video and audio assignment this
 * account may see, with inline status, assignee, due date and linked files
 * (Table when there is room, Items otherwise). CMS-independent: the host
 * supplies the fetchers (`getMediaDesk`, `updateMediaAssignment`, optionally
 * the story-level `updateMediaRequest` for featured images), the file picker
 * and the story links. The page header is the host's.
 */
export function MediaWork(props: MediaWorkProps) {
  const query = useOptionalQuery<MediaDeskResponse>(mediaDeskKey, props.fetchers.getMediaDesk ? () => props.fetchers.getMediaDesk!() : undefined, "Media work");
  return <ResourceGate query={query} label="Media work">{(data) => <MediaDeskContent {...props} data={data} />}</ResourceGate>;
}
