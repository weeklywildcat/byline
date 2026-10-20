import { Clock3, Minus, Users } from "lucide-react";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "../admin-ui/ui/avatar";
import { Button } from "../admin-ui/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "../admin-ui/ui/item";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "../admin-ui/ui/popover";
import { groupPresence, initials, presenceActivityLabel, samePresenceLocation, type PresenceLocation, type PresencePerson } from "./presence-model";

const badgeClass = (status: PresencePerson["status"]) => status === "active"
  ? "bg-emerald-500 text-white"
  : status === "away"
    ? "bg-amber-400 text-amber-950"
    : "bg-muted-foreground/60 text-background";

const badgeIcon = (status: PresencePerson["status"]) => status === "away"
  ? <Clock3 aria-hidden="true" />
  : status === "offline"
    ? <Minus aria-hidden="true" />
    : null;

function PresenceAvatar({ person, size = "default", badge = true, toolbar = false }: { person: PresencePerson; size?: "default" | "sm" | "lg"; badge?: boolean; toolbar?: boolean }) {
  return <Avatar size={size} className={toolbar ? "size-7" : undefined} role="img" aria-label={`${person.name}, ${person.status}`}>
    {person.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
    <AvatarFallback className={toolbar ? "text-[10px]" : undefined}>{initials(person.name)}</AvatarFallback>
    {badge ? <AvatarBadge className={badgeClass(person.status)} aria-hidden="true">{badgeIcon(person.status)}</AvatarBadge> : null}
  </Avatar>;
}

function PresenceRow({ person, now, currentLocation }: { person: PresencePerson; now: number; currentLocation: PresenceLocation }) {
  const together = person.status === "active" && !person.current && samePresenceLocation(person.location, currentLocation);
  const location = person.status !== "offline" ? person.location : null;
  const activity = presenceActivityLabel(person, now);
  const exact = person.lastSeen ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(person.lastSeen * 1000)) : undefined;
  const locationText = together ? "Here with you" : location?.label;
  const locationNode = locationText
    ? location?.href
      ? <a href={location.href} className="truncate underline-offset-4 hover:underline">{locationText}</a>
      : <span className="truncate">{locationText}</span>
    : null;

  return <Item size="xs" className="flex-nowrap px-2 py-2">
    <ItemMedia><PresenceAvatar person={person} size="default" /></ItemMedia>
    <ItemContent className="min-w-0">
      <ItemTitle className="max-w-full truncate">{person.name}{person.current ? <span className="font-normal text-muted-foreground">(you)</span> : null}</ItemTitle>
      <ItemDescription className="flex min-w-0 items-center gap-1.5 text-xs">
        {locationNode}
        {locationNode && location?.detail && !together ? <span aria-hidden="true">·</span> : null}
        {location?.detail && !together ? <span className="truncate">{location.detail}</span> : null}
      </ItemDescription>
    </ItemContent>
    <ItemActions className="ml-auto shrink-0 self-start pt-0.5 text-right">
      <span className="text-[11px] leading-4 text-muted-foreground" title={exact}>{activity}</span>
    </ItemActions>
  </Item>;
}

function PresenceSection({ label, people, now, currentLocation }: { label: string; people: PresencePerson[]; now: number; currentLocation: PresenceLocation }) {
  if (!people.length) return null;
  return <section aria-label={label} className="flex flex-col gap-1">
    <h3 className="px-2 pt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</h3>
    <ItemGroup className="gap-0">{people.map((person) => <PresenceRow key={person.id} person={person} now={now} currentLocation={currentLocation} />)}</ItemGroup>
  </section>;
}

export function PresencePanel({ people, now, currentLocation, recentSeconds }: { people: PresencePerson[]; now: number; currentLocation: PresenceLocation; recentSeconds: number }) {
  const groups = groupPresence(people, now, recentSeconds);
  const online = [...groups.active, ...groups.away];
  const shown = online.slice(0, 3);
  const overflow = Math.max(0, online.length - shown.length);
  const activeLabel = groups.active.length === 1 ? "1 person active" : `${groups.active.length} people active`;

  return <Popover>
    <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-8 min-w-8 gap-1 rounded-md px-1.5 text-white hover:bg-white/10 hover:text-white focus-visible:ring-white/50" aria-label={`Newsroom presence, ${activeLabel}`} />}>
      {shown.length ? <AvatarGroup className="-space-x-1.5">
        {shown.map((person) => <PresenceAvatar key={person.id} person={person} toolbar />)}
        {overflow ? <AvatarGroupCount className="size-7 bg-neutral-700 text-[10px] text-white ring-neutral-900">+{overflow}</AvatarGroupCount> : null}
      </AvatarGroup> : <Users className="size-4" aria-hidden="true" />}
    </PopoverTrigger>
    <PopoverContent align="end" sideOffset={8} className="w-[22rem] max-w-[calc(100vw-1rem)] gap-2 p-2">
      <PopoverHeader className="px-2 pt-1 pb-1">
        <PopoverTitle>Newsroom</PopoverTitle>
        <PopoverDescription>{activeLabel}{groups.away.length ? ` · ${groups.away.length} away` : ""}</PopoverDescription>
      </PopoverHeader>
      <div className="max-h-[min(32rem,70vh)] overflow-y-auto overscroll-contain">
        <PresenceSection label="Active now" people={groups.active} now={now} currentLocation={currentLocation} />
        <PresenceSection label="Away" people={groups.away} now={now} currentLocation={currentLocation} />
        <PresenceSection label="Recently active" people={groups.recent} now={now} currentLocation={currentLocation} />
        <PresenceSection label="Offline" people={groups.offline} now={now} currentLocation={currentLocation} />
      </div>
    </PopoverContent>
  </Popover>;
}
