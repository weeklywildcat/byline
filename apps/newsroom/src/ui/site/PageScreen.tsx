"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Checkbox } from "@byline/newsroom-ui/ui/checkbox";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Item, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { Textarea } from "@byline/newsroom-ui/ui/textarea";
import { RenderFields, useAuth, useConfig, useDocumentInfo, useForm, useFormBackgroundProcessing, useFormModified, useFormProcessing } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CollapsibleFieldClientComponent } from "payload";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { slugify } from "../../domain/slug";
import type { PageContext } from "../../newsroom/site-pages";
import { ShellLink, useLeaveGuard } from "../shell/navigation";
import { getJson } from "../story/api";
import { childField, relationIdOf, useSettleAutosave, useStoryField } from "../story/form";
import { formatDay } from "../story/parts";
import { PublicationActions } from "../story/PublicationActions";
import { SinglePicker } from "../story/RelationPickers";
import type { Id } from "../story/types";

export const PageScreen: CollapsibleFieldClientComponent = ({ field, parentPath, parentSchemaPath, indexPath, permissions, readOnly }) => {
  const { config } = useConfig();
  const { user } = useAuth();
  const doc = useDocumentInfo();
  const { submit } = useForm();
  const shellQueries = useQueryClient();
  const { id, hasPublishedDoc, hasPublishPermission, unpublishedVersionCount } = doc;
  const title = useStoryField<string>("title");
  const slug = useStoryField<string>("slug");
  const parent = useStoryField<Id | null>("parent");
  const summary = useStoryField<string>("summary");
  const noindex = useStoryField<boolean>("noindex");
  const body = childField(field.fields, "body");
  const [confirm, setConfirm] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  const saving = processing || background;
  const timeZone = (config.admin?.custom as { newsroomTimeZone?: string } | undefined)?.newsroomTimeZone ?? "America/New_York";
  const api = config.routes.api;
  const admin = config.routes.admin;
  const data = useQuery({ queryKey: ["byline", "page", id, doc.versionCount], enabled: id != null, queryFn: () => getJson<PageContext>(api, `/byline/pages/${id}/context`) });
  const active = data.data;
  const parentPathname = active?.parents.find((row) => String(row.id) === String(relationIdOf(parent.value)))?.path ?? "/";
  const candidate = slugify(slug.value || title.value);
  const next = candidate ? `${parentPathname}${candidate}/` : "";
  const changed = active?.path && next && active.path !== next ? { old: active.path, next } : null;
  const canPublish = !readOnly && hasPublishPermission && !saving && !publishing && !active?.scheduledAt && (!hasPublishedDoc || unpublishedVersionCount > 0 || modified) && (!hasPublishedDoc || Boolean(active));
  const refresh = () => {
    void data.refetch();
    void shellQueries.invalidateQueries({ queryKey: ["byline", "site", "pages"] });
  };
  async function publish() {
    setConfirm(false); setPublishing(true);
    try {
      const result = await submit({ action: `${api}/pages/${id}?depth=0`, overrides: { _status: "published" } });
      if (result?.res.ok) {
        doc.setHasPublishedDoc(true);
        doc.setUnpublishedVersionCount(0);
        doc.setMostRecentVersionIsAutosaved(false);
        refresh();
        toast.success("Page published.");
      }
    } catch {
      toast.error("The page could not be published. Check its title, slug and parent.");
    } finally {
      setPublishing(false);
    }
  }

  if (id == null) return <RenderFields fields={field.fields} parentPath={parentPath ?? ""} parentSchemaPath={parentSchemaPath ?? "pages"} parentIndexPath={indexPath ?? ""} permissions={(permissions ?? true) as never} readOnly={readOnly} />;
  return <div onSubmit={(event) => event.stopPropagation()}>
    <AdminRoot className="byline-page" toaster={false}>
      <PageSaveState />
      <main className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-6 md:px-8">
        <ShellLink href={`${admin}/site?tab=pages&page=${id}`} className="text-sm underline">Site / Pages</ShellLink>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]">{title.value || "Untitled page"}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{hasPublishedDoc ? unpublishedVersionCount || modified ? "Unpublished changes" : "Published" : "Draft"}</Badge>
            <span role="status" className="text-xs text-muted-foreground">{saving ? "Saving…" : modified ? "Unsaved" : "Saved"}</span>
            <Button ref={trigger} type="button" size="sm" disabled={!canPublish} onClick={() => changed ? setConfirm(true) : void publish()}>{hasPublishedDoc ? "Publish changes" : "Publish page"}</Button>
            {!readOnly && hasPublishPermission && active ? <PublicationActions page context={{ api, admin, timeZone, storyId: id, role: "administrator", userId: user?.id, readOnly: Boolean(readOnly), shellQueries }} scheduledAt={active.scheduledAt} changedPath={changed} saving={saving || modified || publishing} canSchedule={!saving && !modified && (!hasPublishedDoc || unpublishedVersionCount > 0)} onChanged={refresh} /> : null}
          </div>
        </header>
        {active?.scheduledAt ? <p className="text-sm">Scheduled publication: {formatDay(active.scheduledAt, timeZone)} ({timeZone})</p> : null}
        <Tabs defaultValue="edit">
          <TabsList><TabsTrigger value="edit">Edit page</TabsTrigger><TabsTrigger value="history">History</TabsTrigger></TabsList>
          <TabsContent value="edit" keepMounted className="grid gap-3 pt-3">
            <div className="grid gap-1"><label htmlFor="byline-page-title">Title</label><Input id="byline-page-title" value={title.value ?? ""} readOnly={readOnly} onChange={(e) => title.setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} /></div>
            <div className="grid gap-1"><label htmlFor="byline-page-slug">Slug</label><Input id="byline-page-slug" value={slug.value ?? ""} readOnly={readOnly} onChange={(e) => slug.setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} /></div>
            <SinglePicker label="Parent page" placeholder="No parent" options={active?.parents ?? []} value={relationIdOf(parent.value)} onChange={(value) => parent.setValue(value)} disabled={readOnly || !active} />
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">Public URL: {active?.path ? <a href={active.publicSite + active.path} target="_blank" rel="noreferrer" className="underline">{active.path}</a> : next || "Add a slug to see the address."}{changed ? ` · After publishing: ${changed.next}` : ""}</p>
            <div className="grid gap-1"><label htmlFor="byline-page-summary">Summary</label><Textarea id="byline-page-summary" rows={3} value={summary.value ?? ""} readOnly={readOnly} onChange={(e) => summary.setValue(e.target.value)} /></div>
            <label className="flex items-center gap-2"><Checkbox disabled={readOnly} checked={noindex.value === true} onCheckedChange={(value) => noindex.setValue(value)} /> Hide from search engines</label>
            {body ? <div className="byline-payload-field"><RenderFields fields={[body]} parentPath={parentPath ?? ""} parentSchemaPath={parentSchemaPath ?? "pages"} parentIndexPath={indexPath ?? ""} permissions={(permissions ?? true) as never} readOnly={readOnly} /></div> : null}
          </TabsContent>
          <TabsContent value="history" className="pt-3">
            {data.isError ? <p role="alert">Page history is unavailable.</p> : !active?.versions.length ? <p className="text-sm text-muted-foreground">No versions to show.</p> : <ItemGroup>{active.versions.map((version) => <Item key={version.id} size="sm" variant="outline"><ItemContent><ItemTitle>{version.title}</ItemTitle><p className="text-xs text-muted-foreground">{formatDay(version.at, timeZone)} · {version.published ? "Publication" : version.autosave ? "Autosave" : "Draft save"}</p></ItemContent></Item>)}</ItemGroup>}
          </TabsContent>
        </Tabs>
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent finalFocus={trigger}>
            <AlertDialogHeader><AlertDialogTitle>Change the published page URL?</AlertDialogTitle><AlertDialogDescription>Byline will preserve the old page address and any moved descendant addresses with permanent redirects.</AlertDialogDescription></AlertDialogHeader>
            <p className="text-sm [overflow-wrap:anywhere]">{changed?.old} → {changed?.next}</p>
            <AlertDialogFooter><AlertDialogCancel type="button">Cancel</AlertDialogCancel><Button type="button" onClick={() => void publish()}>Publish with redirects</Button></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </AdminRoot>
  </div>;
};

function PageSaveState() {
  useSettleAutosave();
  const modified = useFormModified();
  const processing = useFormProcessing();
  const background = useFormBackgroundProcessing();
  useLeaveGuard(() => ({ modified, saving: processing || background }));
  return null;
}
