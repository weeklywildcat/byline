import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@byline/newsroom-ui/ui/input-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { MediaLibraryFetchers } from "./media-library-api";
import { cleanMediaName, MEDIA_NAME_MAX, splitFilename, type MediaAssetDetail, type MediaLibraryAsset } from "./media-library-model";
import { invalidateMediaLibrary, replaceCachedAsset } from "./media-query";

type RenameFetchers = Pick<MediaLibraryFetchers, "renameMedia">;

/**
 * Renames one file: the server keeps its type (the extension isn't editable)
 * and makes a taken name unique ("-1"). The caller decides which version the
 * rename is compared against (`expectedUpdatedAt`).
 */
export function useRenameMedia(fetchers: RenameFetchers, onRenamed?: (saved: MediaAssetDetail) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ asset, name, expectedUpdatedAt }: { asset: Pick<MediaLibraryAsset, "id" | "filename" | "updatedAt">; name: string; expectedUpdatedAt?: string }) => {
      if (!fetchers.renameMedia) throw new Error("Renaming isn't available here.");
      return fetchers.renameMedia(asset.id, { name, expectedUpdatedAt: expectedUpdatedAt ?? asset.updatedAt });
    },
    onSuccess: async (saved, { name, asset }) => {
      replaceCachedAsset(client, saved);
      await invalidateMediaLibrary(client);
      const { extension } = splitFilename(asset.filename);
      const asked = `${cleanMediaName(name, extension)}${extension}`;
      toast.success(saved.filename === asked || saved.filename === asset.filename ? `Renamed to ${saved.filename}` : `Renamed to ${saved.filename} (${asked} was taken)`);
      onRenamed?.(saved);
    }
  });
}

/** The name field: the editable name, with the file's extension shown as a fixed suffix. */
export function MediaNameInput({ id, filename, value, onChange, invalid, autoFocus, onEscape }: { id: string; filename: string; value: string; onChange: (value: string) => void; invalid?: boolean; autoFocus?: boolean; onEscape?: () => void }) {
  const { extension } = splitFilename(filename);
  const input = useRef<HTMLInputElement | null>(null);
  // Focus with the whole name selected, so typing replaces it.
  useEffect(() => {
    if (!autoFocus) return;
    const element = input.current;
    element?.focus();
    element?.select();
  }, [autoFocus]);
  return (
    <InputGroup>
      <InputGroupInput
        ref={input}
        id={id}
        value={value}
        maxLength={MEDIA_NAME_MAX + extension.length}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && onEscape) {
            event.preventDefault();
            event.stopPropagation();
            onEscape();
          }
        }}
        data-media-name-input=""
      />
      {extension ? <InputGroupAddon align="inline-end"><InputGroupText>{extension}</InputGroupText></InputGroupAddon> : null}
    </InputGroup>
  );
}

/** Rename from the Library's context menu (the inspector renames in place). */
export function MediaRenameDialog({ asset, onClose, fetchers }: { asset: MediaLibraryAsset | null; onClose: () => void; fetchers: RenameFetchers }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rename = useRenameMedia(fetchers, () => onClose());
  useEffect(() => {
    if (!asset) return;
    setName(splitFilename(asset.filename).stem);
    setError(null);
    rename.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);
  const unchanged = asset ? cleanMediaName(name, splitFilename(asset.filename).extension) === splitFilename(asset.filename).stem : true;
  const submit = () => {
    if (!asset || rename.isPending) return;
    if (!cleanMediaName(name, splitFilename(asset.filename).extension)) return setError("Give the file a name.");
    if (unchanged) return onClose();
    rename.mutate({ asset, name }, { onError: (failure: { message?: string }) => setError(failure?.message || "The file couldn't be renamed.") });
  };
  return (
    <Dialog open={asset !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md" data-media-rename-dialog="">
        <form className="contents" onSubmit={(event) => { event.preventDefault(); event.stopPropagation(); submit(); }}>
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
            <DialogDescription>Stories and assignments that use it keep it. Its type stays the same.</DialogDescription>
          </DialogHeader>
          {asset ? (
            <Field data-invalid={Boolean(error) || undefined}>
              <FieldLabel htmlFor="media-rename-name">Name</FieldLabel>
              <MediaNameInput id="media-rename-name" filename={asset.filename} value={name} onChange={(value) => { setName(value); setError(null); }} invalid={Boolean(error)} autoFocus />
              {error ? <FieldError>{error}</FieldError> : <FieldDescription>Letters, numbers, spaces, dashes and dots. A name already in use gets a number added.</FieldDescription>}
            </Field>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={rename.isPending || !name.trim()}>{rename.isPending ? "Renaming…" : "Rename"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
