"use client";

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { slugify } from "../../domain/slug";
import type { SiteGroup, SiteRows } from "../../newsroom/site";
import { createBylineRequest } from "../home/payload-fetchers";
import { useNewsroomRoutes } from "../shell/account";
import { useShellNavigation } from "../shell/navigation";

const singular = { sections: "Section", topics: "Topic", redirects: "redirect", pages: "Page" };
const reasonLabel = { manual: "Manual", "story-url-change": "Story URL change", "page-url-change": "Page URL change", "section-slug-change": "Section slug change" };
type Row = SiteRows["rows"][number];
type Edit = { id?: number; title: string; slug: string; description: string; hidden: boolean; to: string; expected?: string };
const empty = (): Edit => ({ title: "", slug: "", description: "", hidden: false, to: "" });

export function SiteRecords({ group }: { group: SiteGroup }) {
  const routes = useNewsroomRoutes();
  const { navigate } = useShellNavigation();
  const request = createBylineRequest(routes.api);
  const selected = Number(useSearchParams()?.get("page"));
  const base = `/site/${group}`;
  const records = useQuery({ queryKey: ["byline", "site", group], queryFn: () => request<SiteRows>(base) });
  const [editing, setEditing] = useState<Edit | null>(null);
  const [impact, setImpact] = useState<number | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const prefix = useId();
  const redirects = group === "redirects";
  const pages = group === "pages";

  function open(row?: Row) {
    if (pages && row) { navigate(`${routes.admin}/collections/pages/${row.id}`); return; }
    trigger.current = document.activeElement as HTMLElement | null;
    setError(""); setImpact(null);
    setEditing(row ? { ...empty(), id: row.id, title: row.title, slug: row.slug ?? "", hidden: row.hidden, to: row.to ?? "", description: row.description ?? "", expected: row.revision } : empty());
  }
  function change(values: Partial<Edit>) { setEditing((current) => current && { ...current, ...values }); }
  async function save(event?: FormEvent, confirmed?: number) {
    event?.preventDefault();
    if (busy || (!editing && !removing)) return;
    setError(""); setBusy(true);
    try {
      if (removing) await request(`${base}/${removing.id}`, "DELETE", { expected: removing.revision });
      else if (editing) {
        const original = records.data?.rows.find((row) => row.id === editing.id);
        if (group === "sections" && editing.id && original?.slug !== slugify(editing.slug || editing.title) && confirmed === undefined) {
          const result = await request<{ stories: number }>(`${base}/${editing.id}/impact`);
          if (result.stories) { setImpact(result.stories); return; }
        }
        const result = await request<{ id: number }>(editing.id ? `${base}/${editing.id}` : base, editing.id ? "PATCH" : "POST", { ...editing, impact: confirmed });
        if (pages) navigate(`${routes.admin}/collections/pages/${result.id}`);
      }
      toast.success(removing ? "Redirect removed." : `${singular[group]} saved.`);
      setEditing(null); setRemoving(null); setImpact(null);
      void records.refetch();
    } catch (error) {
      setError((error as { message?: string }).message ?? "The item could not be saved.");
      setImpact(null);
      void records.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <section className="grid gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{redirects ? "Automatic redirects preserve old addresses. Manual redirects can be changed here." : pages ? "Institutional pages are edited and published individually." : group === "sections" ? "Sections are part of the public Story address." : "Topics connect related stories."}</p>
      <Button ref={add} type="button" size="sm" onClick={() => open()}>Add {singular[group]}</Button>
    </div>
    {records.isPending ? <p role="status">Loading…</p> : records.isError ? <p role="alert">This view could not be loaded.</p> : !records.data.rows.length ? <p className="text-sm text-muted-foreground">No {group} yet.</p> : null}
    <ItemGroup className="gap-2">{records.data?.rows.map((row) => <Item key={row.id} variant="outline" size="sm" className={pages && row.id === selected ? "border-primary" : undefined}>
      <ItemContent className="min-w-0 [overflow-wrap:anywhere]"><ItemTitle>{row.title}</ItemTitle>
        {row.slug || row.to ? <p className="text-xs text-muted-foreground">{row.to ? `To ${row.to}` : row.slug}</p> : null}
        {row.description ? <p className="text-sm">{row.description}</p> : null}
      </ItemContent>
      <div className="flex flex-wrap items-center gap-1">
        {row.hidden ? <Badge variant="secondary">Internal</Badge> : null}
        {row.reason ? <Badge variant="secondary">{reasonLabel[row.reason]}</Badge> : null}
        {pages ? <Badge variant="secondary">{row.published ? "Published" : "Draft changes"}</Badge> : null}
        {!redirects || row.reason === "manual" ? <Button type="button" size="sm" variant="outline" onClick={() => open(row)}>{pages ? "Open page" : "Edit"}</Button> : null}
        {redirects && row.reason === "manual" ? <Button type="button" size="sm" variant="ghost" onClick={() => { trigger.current = document.activeElement as HTMLElement | null; setError(""); setRemoving(row); }}>Remove</Button> : null}
      </div>
    </Item>)}</ItemGroup>
    <Dialog open={Boolean(editing) && impact === null} onOpenChange={(open) => { if (!open && !busy && impact === null) setEditing(null); }}>
      <DialogContent finalFocus={() => trigger.current ?? add.current} className="max-h-[calc(100dvh-2rem)] overflow-auto">
        <DialogHeader><DialogTitle>{editing?.id ? "Edit" : "Add"} {singular[group]}</DialogTitle><DialogDescription>{redirects ? "Use paths on this site, starting with /." : "Set the name readers and the newsroom will see."}</DialogDescription></DialogHeader>
        {editing ? <form className="grid gap-2" onSubmit={save}>
          <label htmlFor={`${prefix}-title`}>{redirects ? "Old path" : pages ? "Title" : "Name"}</label><Input id={`${prefix}-title`} value={editing.title} required onChange={(event) => change({ title: event.target.value })} />
          {redirects ? <><label htmlFor={`${prefix}-to`}>Destination path</label><Input id={`${prefix}-to`} value={editing.to} required onChange={(event) => change({ to: event.target.value })} /></> : pages ? null : <>
            <label htmlFor={`${prefix}-slug`}>Slug</label><Input id={`${prefix}-slug`} value={editing.slug} maxLength={120} placeholder="Generated from the name" onChange={(event) => change({ slug: event.target.value })} />
            <label htmlFor={`${prefix}-description`}>Description</label><Textarea id={`${prefix}-description`} value={editing.description} maxLength={600} rows={3} onChange={(event) => change({ description: event.target.value })} />
            {group === "sections" ? <label className="flex items-center gap-2"><Checkbox checked={editing.hidden} onCheckedChange={(hidden) => change({ hidden })} /> Internal section (hidden from readers)</label> : null}
          </>}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter><DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Cancel</DialogClose><Button type="submit" disabled={busy}>{busy ? "Saving…" : pages ? "Create draft" : "Save"}</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
    <AlertDialog open={impact !== null || Boolean(removing)} onOpenChange={(open) => { if (!open && !busy) { setImpact(null); setRemoving(null); } }}>
      <AlertDialogContent finalFocus={() => trigger.current?.isConnected ? trigger.current : add.current}>
        <AlertDialogHeader>
          <AlertDialogTitle>{removing ? "Remove this redirect?" : "Change the Section slug?"}</AlertDialogTitle>
          <AlertDialogDescription>{removing ? "The old address will no longer redirect after the next site build." : `${impact} published ${impact === 1 ? "story will" : "stories will"} get a new address. Byline will preserve each old address with a permanent redirect.`}</AlertDialogDescription>
        </AlertDialogHeader>
        {removing && error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter><AlertDialogCancel type="button" disabled={busy}>Cancel</AlertDialogCancel><Button type="button" variant={removing ? "destructive" : "default"} disabled={busy} onClick={() => void save(undefined, impact ?? undefined)}>{removing ? "Remove redirect" : "Change slug"}</Button></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
