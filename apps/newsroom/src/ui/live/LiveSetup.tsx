"use client";

import { Button } from "@byline/newsroom-ui/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@byline/newsroom-ui/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@byline/newsroom-ui/ui/drawer";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@byline/newsroom-ui/ui/field";
import { Spinner } from "@byline/newsroom-ui/ui/spinner";
import { Switch } from "@byline/newsroom-ui/ui/switch";
import { PersonAvatar } from "@byline/newsroom-ui/components/person-avatar";
import { useIsMobile } from "@byline/newsroom-ui/lib/hooks";
import { useEffect, useState, type ReactNode } from "react";
import type { LiveDeskResponse } from "../../newsroom/live-coverage";
import { useLiveCandidates } from "./api";

/** The dialog on a desk or laptop, the bottom drawer on a phone (the Story screen's usual responsive pattern). */
export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader><DrawerTitle>{title}</DrawerTitle><DrawerDescription>{description}</DrawerDescription></DrawerHeader>
          <div className="max-h-[55dvh] overflow-y-auto px-4">{children}</div>
          <DrawerFooter>{footer}</DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-full overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Direct publishing": who, besides editors, may publish live updates on this Story. Staff who work on the
 * Story only, plus anyone who already has the grant so it can always be removed. The grant is only live
 * updates on this Story: never the article, the mode, starting or ending coverage.
 */
export function PublisherFields({ api, storyId, selected, onChange, disabled }: {
  api: string;
  storyId: number;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  disabled?: boolean;
}) {
  const candidates = useLiveCandidates(api, storyId, true);
  const people = candidates.data?.people ?? [];
  return (
    <section aria-labelledby={`direct-publishing-${storyId}`} className="grid gap-3">
      <div className="grid gap-1">
        <h3 id={`direct-publishing-${storyId}`} className="text-sm font-medium">Direct publishing</h3>
        <p className="text-sm text-muted-foreground">Editors can always publish live updates. Choose reporters who may also publish directly on this Story.</p>
      </div>
      {candidates.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading reporters…</p> : null}
      {candidates.isError ? <p role="alert" className="text-sm text-destructive">{(candidates.error as Error).message}</p> : null}
      {candidates.data && !people.length ? <p className="text-sm text-muted-foreground">No reporters work on this story yet. Add them to the byline or give them work, then choose who may publish.</p> : null}
      {people.length ? (
        <FieldGroup className="gap-3">
          {people.map((person) => {
            const id = `live-publisher-${storyId}-${person.id}`;
            return (
              <Field key={person.id} orientation="horizontal" className="items-center">
                <PersonAvatar name={person.name} url={person.avatarUrl} />
                <FieldContent>
                  <FieldLabel htmlFor={id}>{person.name}</FieldLabel>
                  <FieldDescription>{person.relation}</FieldDescription>
                </FieldContent>
                <Switch
                  id={id}
                  aria-label={`${person.name} may publish live updates`}
                  disabled={disabled}
                  checked={selected.has(person.id)}
                  onCheckedChange={(checked) => { const next = new Set(selected); if (checked) next.add(person.id); else next.delete(person.id); onChange(next); }}
                />
              </Field>
            );
          })}
        </FieldGroup>
      ) : null}
    </section>
  );
}

/**
 * "Set up live coverage" (first time) and "Manage direct publishers". Setup configures Live mode and who may
 * publish directly; it never silently starts coverage. An unpublished live Story can be published for sharing
 * without starting coverage, so Live does not have to travel through the ordinary review workflow first.
 */
export function LiveSetupDialog({ open, onOpenChange, intent, api, desk, busy, readOnly, onSetUp, onPublishForLater, onManage, onGoLive, goLiveHere = true }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: "setup" | "manage";
  api: string;
  desk: LiveDeskResponse;
  busy: boolean;
  readOnly: boolean;
  onSetUp: (publishers: number[]) => void | Promise<void>;
  onPublishForLater?: (publishers: number[]) => void | Promise<void>;
  onManage: (publishers: number[]) => void | Promise<void>;
  onGoLive: (publishers: number[]) => void | Promise<void>;
  /** Field can start coverage only for a Story that is already public; publishing the article is Write's. */
  goLiveHere?: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(desk.publishers.map((person) => person.id)));
  // Start from the saved grants each time the sheet opens.
  useEffect(() => { if (open) setSelected(new Set(desk.publishers.map((person) => person.id))); }, [open, desk.publishers]);
  const ids = [...selected];
  const manage = intent === "manage";
  const blocked = !desk.canControl || readOnly;
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={manage ? "Direct publishers" : "Set up live coverage"}
      description={manage ? "Who may publish live updates on this Story, besides editors." : "Add timestamped updates to this story from Write or Field Mode."}
      footer={manage ? (
        <>
          <Button type="button" variant="outline" className="max-sm:min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="max-sm:min-h-11" disabled={busy || blocked} onClick={() => void onManage(ids)}>{busy ? <Spinner /> : null}Save</Button>
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" className="max-sm:min-h-11" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant={desk.storyPublished ? "outline" : "ghost"} className="max-sm:min-h-11" disabled={busy || blocked} onClick={() => void onSetUp(ids)}>{desk.storyPublished ? "Set up for later" : "Set up without publishing"}</Button>
          {!desk.storyPublished && goLiveHere && onPublishForLater ? <Button type="button" className="max-sm:min-h-11" disabled={busy || blocked} onClick={() => void onPublishForLater(ids)}>{busy ? <Spinner /> : null}Publish for later</Button> : null}
          {goLiveHere ? <Button type="button" variant={desk.storyPublished ? "default" : "outline"} className="max-sm:min-h-11" disabled={busy || blocked} onClick={() => void onGoLive(ids)}>{busy ? <Spinner /> : null}{desk.storyPublished ? "Go live" : "Publish & go live"}</Button> : null}
        </>
      )}
    >
      <div className="grid gap-4">
        {!manage && !desk.storyPublished ? <p className="text-sm text-muted-foreground">This story isn't published yet. Publish for later makes the story shareable but keeps coverage Not started. Publish & go live starts coverage now. Both run the normal publication checks; the ordinary review workflow is optional for Live stories.</p> : null}
        {!manage && !goLiveHere ? <p className="text-sm text-muted-foreground">Publish this story from Write to go live. You can still set up Live mode and direct publishers now.</p> : null}
        {blocked ? <p role="alert" className="text-sm text-destructive">Only editors can change live coverage.</p> : null}
        <PublisherFields api={api} storyId={desk.storyId} selected={selected} onChange={setSelected} disabled={busy || blocked} />
      </div>
    </ResponsiveSheet>
  );
}
