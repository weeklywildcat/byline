import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { DialogRoot as Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/adaptive-dialog";
import { Field, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Input } from "@byline/newsroom-ui/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@byline/newsroom-ui/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { mediaFoldersKey, type MediaLibraryFetchers } from "./media-library-api";
import { childFolderCount, folderPath, folderSubtreeIds, type MediaFolder, type MediaLibraryAsset } from "./media-library-model";
import { invalidateMediaLibrary, replaceCachedAsset } from "./media-query";

/** What a folder or file action asked for. One dialog at a time. */
export type MediaFolderRequest =
  | { kind: "create"; parentId: number | null }
  | { kind: "rename"; folder: MediaFolder }
  | { kind: "move-folder"; folder: MediaFolder }
  | { kind: "delete"; folder: MediaFolder }
  | { kind: "move-assets"; assets: MediaLibraryAsset[] };

const TOP = "__top";
const UNFILED = "__unfiled";

type Fetchers = Pick<MediaLibraryFetchers, "createFolder" | "updateFolder" | "deleteFolder" | "moveMedia">;

/**
 * Folder management (editors) and filing files into folders: shadcn Dialogs
 * for a name or a destination, an AlertDialog for delete. A folder that
 * still holds files or subfolders can't be deleted; the dialog says what is
 * in it instead of offering a destructive option. The server enforces all of
 * it again (folder access, Media access, the non-empty rule).
 */
export function MediaFolderDialogs({ request, onClose, fetchers, folders, onCreated, onDeleted }: { request: MediaFolderRequest | null; onClose: () => void; fetchers: Fetchers; folders: MediaFolder[]; onCreated?: (folder: MediaFolder) => void; onDeleted?: (folder: MediaFolder) => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<string>(TOP);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setError(null);
    if (!request) return;
    if (request.kind === "rename") setName(request.folder.name);
    else setName("");
    if (request.kind === "move-folder") setTarget(request.folder.parentId === null ? TOP : String(request.folder.parentId));
    if (request.kind === "move-assets") setTarget(request.assets.length === 1 && request.assets[0].folder ? String(request.assets[0].folder.id) : UNFILED);
  }, [request]);

  const pathLabel = (id: number) => folderPath(folders, id).map((item) => item.name).join(" / ");
  const targets = useMemo(() => {
    const excluded = request?.kind === "move-folder" ? folderSubtreeIds(folders, request.folder.id) : new Set<number>();
    const options = folders.filter((folder) => !excluded.has(folder.id)).map((folder) => ({ value: String(folder.id), label: pathLabel(folder.id) })).sort((a, b) => a.label.localeCompare(b.label));
    return request?.kind === "move-assets" ? [{ value: UNFILED, label: "Unfiled" }, ...options] : [{ value: TOP, label: "Top level" }, ...options];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, request]);

  const done = async (message: string) => {
    await client.invalidateQueries({ queryKey: mediaFoldersKey });
    toast.success(message);
    onClose();
  };
  const fail = (failure: { message?: string }) => setError(failure?.message || "That didn't work. Try again.");

  const create = useMutation({ mutationFn: (parentId: number | null) => fetchers.createFolder({ name, parentId }), onSuccess: async (folder) => { onCreated?.(folder); await done(`Folder “${folder.name}” created`); }, onError: fail });
  const rename = useMutation({ mutationFn: (folder: MediaFolder) => fetchers.updateFolder(folder.id, { name }), onSuccess: (folder) => done(`Renamed to “${folder.name}”`), onError: fail });
  const reparent = useMutation({ mutationFn: (folder: MediaFolder) => fetchers.updateFolder(folder.id, { parentId: target === TOP ? null : Number(target) }), onSuccess: (folder) => done(`Moved “${folder.name}”`), onError: fail });
  const remove = useMutation({ mutationFn: (folder: MediaFolder) => fetchers.deleteFolder(folder.id).then(() => folder), onSuccess: async (folder) => { onDeleted?.(folder); await done(`Folder “${folder.name}” deleted`); }, onError: (failure: { message?: string }) => { toast.error(failure?.message || "The folder couldn't be deleted."); onClose(); } });
  const file = useMutation({
    mutationFn: (assets: MediaLibraryAsset[]) => fetchers.moveMedia(assets.map((asset) => asset.id), target === UNFILED ? null : Number(target)),
    onSuccess: async (result, assets) => {
      const destination = target === UNFILED ? null : folders.find((folder) => folder.id === Number(target)) ?? null;
      for (const asset of assets) if (result.moved.includes(asset.id)) replaceCachedAsset(client, { ...asset, folder: destination ? { id: destination.id, name: destination.name } : null });
      await invalidateMediaLibrary(client);
      if (result.failed.length) toast.error(result.failed.length === 1 ? result.failed[0].message : `${result.failed.length} files couldn't be moved. ${result.failed[0].message}`);
      if (result.moved.length) toast.success(`${result.moved.length === 1 ? "File" : `${result.moved.length} files`} moved to ${destination ? destination.name : "Unfiled"}`);
      onClose();
    },
    onError: fail
  });

  const pending = create.isPending || rename.isPending || reparent.isPending || file.isPending;
  const open = request !== null && request.kind !== "delete";
  const named = request?.kind === "create" || request?.kind === "rename";

  const submit = () => {
    if (!request) return;
    setError(null);
    if (request.kind === "create") create.mutate(request.parentId);
    if (request.kind === "rename") rename.mutate(request.folder);
    if (request.kind === "move-folder") reparent.mutate(request.folder);
    if (request.kind === "move-assets") file.mutate(request.assets);
  };

  const title = request?.kind === "create" ? (request.parentId === null ? "New folder" : `New folder in ${pathLabel(request.parentId)}`) : request?.kind === "rename" ? "Rename folder" : request?.kind === "move-folder" ? `Move “${request.folder.name}”` : request?.kind === "move-assets" ? (request.assets.length === 1 ? `Move ${request.assets[0].filename}` : `Move ${request.assets.length} files`) : "";
  const description = request?.kind === "move-folder" ? "Its files and subfolders move with it. Files keep their links." : request?.kind === "move-assets" ? "Folders are for organizing only: the file's link and its uses don't change." : "Folders organize the Library. They never change a file's link.";

  const deleting = request?.kind === "delete" ? request.folder : null;
  const children = deleting ? childFolderCount(folders, deleting.id) : 0;
  const blocked = deleting ? deleting.assetCount > 0 || children > 0 : false;

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="sm:max-w-md" data-media-folder-dialog={request?.kind}>
          <form className="contents" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); submit(); }}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            {named ? (
              <Field data-invalid={Boolean(error) || undefined}>
                <FieldLabel htmlFor="media-folder-name">Name</FieldLabel>
                <Input id="media-folder-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} aria-invalid={Boolean(error) || undefined} />
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            ) : (
              <Field data-invalid={Boolean(error) || undefined}>
                <FieldLabel>{request?.kind === "move-assets" ? "Folder" : "Inside"}</FieldLabel>
                <Select items={targets} value={target} onValueChange={(value) => setTarget(String(value ?? TOP))}>
                  <SelectTrigger aria-label={request?.kind === "move-assets" ? "Destination folder" : "Parent folder"} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{targets.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
                {error ? <FieldError>{error}</FieldError> : null}
              </Field>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={pending || (named && !name.trim())}>{pending ? "Saving…" : request?.kind === "create" ? "Create folder" : request?.kind === "rename" ? "Rename" : "Move"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(next) => { if (!next) onClose(); }}>
        <AlertDialogContent data-media-folder-dialog="delete">
          <AlertDialogHeader>
            <AlertDialogTitle>{blocked ? `“${deleting?.name}” isn't empty` : `Delete “${deleting?.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {blocked
                ? `It still holds ${[deleting!.assetCount ? `${deleting!.assetCount} ${deleting!.assetCount === 1 ? "file" : "files"}` : "", children ? `${children} ${children === 1 ? "subfolder" : "subfolders"}` : ""].filter(Boolean).join(" and ")}. Move or remove them first; deleting a folder never deletes or unfiles files.`
                : "The empty folder is removed. No files are affected."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{blocked ? "Close" : "Keep folder"}</AlertDialogCancel>
            {blocked ? null : <AlertDialogAction variant="destructive" disabled={remove.isPending} onClick={() => deleting && remove.mutate(deleting)}>Delete folder</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
