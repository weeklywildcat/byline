"use client";

import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@byline/newsroom-ui/ui/collapsible";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@byline/newsroom-ui/ui/sheet";
import { ChevronDown, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { groupPresence, presenceActivityLabel, type PresencePerson, type PresenceSnapshot } from "../../domain/presence";
import { ShellLink } from "./navigation";
import { usePresence } from "./PresenceProvider";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase()).join("") || "?";
const stateLabel = { active: "Active", away: "Away", offline: "Offline" } as const;

function PresenceAvatar({ person, compact = false }: { person: PresencePerson; compact?: boolean }) {
  return (
    <Avatar size={compact ? "sm" : "default"} aria-hidden="true">
      {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
      <AvatarFallback>{initials(person.name)}</AvatarFallback>
      {person.state !== "offline" && <AvatarBadge className={person.state === "active" ? "bg-emerald-600" : "bg-amber-500"} />}
    </Avatar>
  );
}

function PresenceRows({ people, now, here = false, close }: { people: PresencePerson[]; now: number; here?: boolean; close: () => void }) {
  return (
    <ItemGroup className="gap-0 has-data-[size=xs]:gap-0">
      {people.map((person) => {
        const { location } = person;
        const lastActive = person.lastActive ?? person.lastSeen;
        const exact = lastActive === null ? undefined : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(lastActive);
        return (
          <Item key={person.key} size="xs" role="listitem" className="relative min-h-11 flex-nowrap px-2">
            <ItemMedia><PresenceAvatar person={person} /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="block max-w-full truncate">{person.name}</ItemTitle>
              {location && (
                <ItemDescription>
                  {location.href ? (
                    <ShellLink href={location.href} onClick={(event) => {
                      if (event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) close();
                    }} className="rounded-sm focus-visible:outline-2 focus-visible:outline-ring max-md:after:absolute max-md:after:inset-0">
                      {location.label}
                    </ShellLink>
                  ) : location.label}
                  {location.detail && !here && <span> · {location.detail}</span>}
                </ItemDescription>
              )}
            </ItemContent>
            <ItemActions className="shrink-0 text-right text-xs text-muted-foreground">
              <span title={person.state === "active" ? undefined : exact}>
                {here ? "Here with you" : presenceActivityLabel(person, now)}
              </span>
            </ItemActions>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

type Groups = ReturnType<typeof groupPresence>;
function PresenceContent({ snapshot, groups, failed, refresh, close }: {
  snapshot?: PresenceSnapshot; groups: Groups; failed: boolean; refresh: () => void; close: () => void;
}) {
  return (
    <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain px-2 pb-2">
      {failed && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
          <p>{snapshot ? "Couldn’t refresh presence." : "Presence is temporarily unavailable."}</p>
          <Button type="button" size="sm" variant="ghost" className="min-h-11 md:min-h-0" onClick={refresh}>Retry</Button>
        </div>
      )}
      {snapshot && (
        <>
          {([
            ["Here", groups.here],
            ["Around the newsroom", groups.around],
            ["Away", groups.away]
          ] as const).map(([label, people]) => people.length > 0 && (
            <section aria-label={label} key={label} className={label === "Here" ? "rounded-lg bg-muted/60" : undefined}>
              <h3 className="px-2 pt-2 text-xs font-medium text-foreground">{label}</h3>
              <PresenceRows people={people} now={snapshot.now} here={label === "Here"} close={close} />
            </section>
          ))}
          {!groups.here.length && !groups.around.length && <p className="px-2 py-2 text-sm text-muted-foreground">No one else is active in Byline right now.</p>}
          {groups.offline.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger render={<Button type="button" variant="ghost" className="min-h-11 w-full justify-between px-2 text-muted-foreground md:min-h-0" />}>
                {groups.offline.length} offline <ChevronDown className="in-aria-expanded:rotate-180" aria-hidden="true" />
              </CollapsibleTrigger>
              <CollapsibleContent><PresenceRows people={groups.offline} now={snapshot.now} close={close} /></CollapsibleContent>
            </Collapsible>
          )}
          <p className="border-t border-border px-2 pt-3 pb-1 text-xs text-muted-foreground">
            You appear as {stateLabel[snapshot.self.state]}{snapshot.self.location && ` · ${snapshot.self.location.detail ?? snapshot.self.location.label}`}
          </p>
        </>
      )}
    </div>
  );
}

export function NewsroomPresence({ isMobile }: { isMobile: boolean }) {
  const presence = usePresence();
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => groupPresence(presence?.snapshot?.people ?? [], presence?.location ?? { kind: "other" }), [presence?.snapshot, presence?.location]);
  if (!presence) return null;
  const { snapshot, failed, refresh } = presence;
  const active = [...groups.here, ...groups.around];
  const label = snapshot ? `Newsroom presence, ${active.length} other ${active.length === 1 ? "person" : "people"} active` : "Newsroom presence";
  const summary = snapshot ? `${active.length} active · ${groups.away.length} away` : failed ? "Presence unavailable" : "Checking who’s here…";
  const close = () => setOpen(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) refresh();
  };
  const trigger = <Button type="button" variant="ghost" aria-label={label} className={isMobile ? "min-h-11 min-w-11 gap-1 px-1" : "min-w-8 px-1.5"} />;
  const body = <PresenceContent snapshot={snapshot} groups={groups} failed={failed} refresh={refresh} close={close} />;

  return isMobile ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger}>
        <Users aria-hidden="true" />
        {active.length > 0 && <span className="text-xs tabular-nums" aria-hidden="true">{active.length}</span>}
      </SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[85dvh] gap-0 rounded-t-xl">
        <SheetHeader className="shrink-0 pr-16">
          <SheetTitle>Newsroom</SheetTitle>
          <SheetDescription>{summary}</SheetDescription>
        </SheetHeader>
        <SheetClose render={<Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-11" aria-label="Close newsroom presence" />}><X aria-hidden="true" /></SheetClose>
        {body}
      </SheetContent>
    </Sheet>
  ) : (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger}>
        {active.length ? (
          <AvatarGroup aria-hidden="true">
            {active.slice(0, 3).map((person) => <PresenceAvatar key={person.key} person={person} compact />)}
            {active.length > 3 && <AvatarGroupCount className="text-xs">+{active.length - 3}</AvatarGroupCount>}
          </AvatarGroup>
        ) : <Users aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="max-h-[min(70dvh,var(--available-height))] w-92 max-w-[calc(100vw-1rem)] gap-1 p-0">
        <PopoverHeader className="shrink-0 px-4 pt-3 pb-1">
          <PopoverTitle>Newsroom</PopoverTitle>
          <PopoverDescription>{summary}</PopoverDescription>
        </PopoverHeader>
        {body}
      </PopoverContent>
    </Popover>
  );
}
