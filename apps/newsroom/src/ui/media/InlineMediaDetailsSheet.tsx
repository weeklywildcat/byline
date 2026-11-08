"use client";

import { MediaInspectorContent, type MediaInspectorGuard } from "@byline/newsroom-screens/media/MediaInspectorContent";
import type { ArtDirectionEditResult } from "@byline/newsroom-screens/media/art-direction-model";
import type { MediaLibraryFetchers } from "@byline/newsroom-screens/media/media-library-api";
import { useMediaNavigator } from "@byline/newsroom-screens/media/media-query";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@byline/newsroom-ui/ui/alert-dialog";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { useCallback, useRef, useState } from "react";

export function InlineMediaDetailsSheet({
  mediaId,
  fetchers,
  timezone,
  assetHref,
  onEditArtDirection,
  onClose
}: {
  mediaId: number;
  fetchers: MediaLibraryFetchers;
  timezone: string;
  assetHref: (id: number) => string;
  onEditArtDirection: (id: number) => Promise<ArtDirectionEditResult | null>;
  onClose: (deleted?: boolean) => void;
}) {
  const guard = useRef<MediaInspectorGuard | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const navigator = useMediaNavigator(fetchers);

  const requestClose = useCallback(() => {
    if (guard.current?.dirty()) setConfirmClose(true);
    else onClose();
  }, [onClose]);

  return (
    <>
      <Sheet open onOpenChange={(open) => { if (!open) requestClose(); }}>
        <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 sm:max-w-lg!">
          <SheetHeader className="sr-only">
            <SheetTitle>Media details</SheetTitle>
            <SheetDescription>Edit this file without leaving the story.</SheetDescription>
          </SheetHeader>
          <MediaInspectorContent
            fetchers={fetchers}
            assetId={mediaId}
            navigator={navigator.data}
            timezone={timezone}
            guardRef={guard}
            onClose={requestClose}
            onDeleted={() => onClose(true)}
            assetHref={assetHref}
            onEditArtDirection={onEditArtDirection}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent data-media-unsaved="">
          <AlertDialogHeader>
            <AlertDialogTitle>Save your changes to this file?</AlertDialogTitle>
            <AlertDialogDescription>You've edited this file's details without saving them.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <Button variant="outline" onClick={() => {
              guard.current?.discard();
              setConfirmClose(false);
              onClose();
            }}>Discard</Button>
            <AlertDialogAction onClick={async () => {
              if (await guard.current?.save()) {
                setConfirmClose(false);
                onClose();
              }
            }}>Save changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
