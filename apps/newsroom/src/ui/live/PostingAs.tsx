"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@byline/newsroom-ui/ui/avatar";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@byline/newsroom-ui/ui/command";
import { useQuery } from "@tanstack/react-query";
import { Check, UserRound } from "lucide-react";
import type { PostingAsPerson } from "../../newsroom/posting-as";
import { getJson } from "../story/api";
import { liveEndpoint, liveKey } from "./api";

/**
 * "Live update by …" (newsroom/posting-as.ts): an editor credits a live update to the person who reported it, on
 * a phone passed around in Field or at the desk in Write. Shared by both; Field shows the list in a Drawer, Write
 * in a Popover. It credits the update (and a Field photo); publishing stays the signed-in account's.
 */

export type PostingAuthor = { id: number; name: string; avatarUrl: string | null };

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase()).join("") || "?";

/** A person's profile picture (their linked Person's portrait), with initials until they have one, as in the account menu. */
export function ProfilePicture({ name, url }: { name: string; url: string | null }) {
  return (
    <Avatar size="sm" aria-hidden="true" className="shrink-0">
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

/** "Live update by you · Switch": highlighted while crediting someone else, so it is hard to forget. */
export function PostingAsRow({ author, me, onSwitch, tap, switchButton }: { author: PostingAuthor | null; me: PostingAuthor | { name: string; avatarUrl: string | null } | null; onSwitch?: () => void; tap?: boolean; switchButton?: React.ReactNode }) {
  const who = author ?? me;
  return (
    <div className={`flex items-center gap-2 rounded-md px-2 py-1 ${author ? "border border-primary/40 bg-primary/5" : ""}`} data-posting-as={author ? "other" : "self"}>
      {who ? <ProfilePicture name={who.name} url={who.avatarUrl} /> : <UserRound aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      <p className="min-w-0 flex-1 truncate text-sm" aria-live="polite">Live update by <span className="font-semibold">{author ? author.name : "you"}</span></p>
      {switchButton ?? <Button type="button" variant="ghost" size={tap ? "default" : "sm"} className={tap ? "-mr-2 min-h-11 shrink-0 px-4 text-base" : "shrink-0"} aria-label={`Switch who this live update is by (now ${author ? author.name : "you"})`} onClick={onSwitch}>Switch</Button>}
    </div>
  );
}

/** Everyone an editor may credit, the Story's own people first, searchable. */
export function PostingAsList({ api, storyId, me, current, onPick, enabled, tap }: { api: string; storyId: number; me: { name: string; avatarUrl: string | null } | null; current: number | null; onPick: (person: PostingAuthor | null) => void; enabled: boolean; tap?: boolean }) {
  const people = useQuery({ queryKey: [...liveKey(storyId), "people"], queryFn: () => getJson<{ people: PostingAsPerson[] }>(api, `${liveEndpoint(storyId)}/people`), enabled, staleTime: 5 * 60_000 });
  const list = people.data?.people ?? [];
  const row = tap ? "min-h-11 gap-3 text-base" : "gap-2";
  const item = (person: PostingAsPerson) => (
    <CommandItem key={person.id} value={`${person.name} ${person.id}`} onSelect={() => onPick({ id: person.id, name: person.name, avatarUrl: person.avatarUrl })} className={row} data-posting-as-person={person.id}>
      <ProfilePicture name={person.name} url={person.avatarUrl} />
      <span className="min-w-0 flex-1"><span className="block truncate">{person.name}</span>{person.onStory ? <span className="block truncate text-xs text-muted-foreground">{person.onStory}</span> : null}</span>
      {current === person.id ? <Check aria-label="Selected" className="size-4" /> : null}
    </CommandItem>
  );
  const onStory = list.filter((person) => person.onStory);
  const others = list.filter((person) => !person.onStory);
  return (
    <Command className={tap ? "px-2 pb-[max(0.5rem,var(--byline-safe-bottom))]" : undefined}>
      <CommandInput placeholder="Search people" className={`bg-transparent ${tap ? "text-base" : ""}`} />
      <CommandList className={tap ? "max-h-[50dvh]" : "max-h-72"}>
        <CommandEmpty>{people.isError ? (people.error as Error).message : people.isPending ? "Loading people…" : "Nobody matches."}</CommandEmpty>
        <CommandGroup>
          <CommandItem value="me you myself" onSelect={() => onPick(null)} className={row} data-posting-as-person="self">
            {me ? <ProfilePicture name={me.name} url={me.avatarUrl} /> : <UserRound aria-hidden="true" className="size-4" />}
            <span className="min-w-0 flex-1"><span className="block truncate">You</span>{me ? <span className="block truncate text-xs text-muted-foreground">{me.name}</span> : null}</span>
            {current === null ? <Check aria-label="Selected" className="size-4" /> : null}
          </CommandItem>
        </CommandGroup>
        {onStory.length ? <CommandGroup heading="On this story">{onStory.map(item)}</CommandGroup> : null}
        {others.length ? <CommandGroup heading="Everyone else">{others.map(item)}</CommandGroup> : null}
      </CommandList>
    </Command>
  );
}

export const POSTING_AS_HELP = "Live updates are credited to who you pick until you switch back. You're still the one publishing.";
