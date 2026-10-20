import { Avatar, AvatarGroup, AvatarGroupCount, AvatarImage } from "../ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../ui/hover-card";

/** Writers carry `imageUrl`; planning rows carry `avatarUrl`. Either names the picture. */
export type AvatarPerson = { name: string; imageUrl?: string | null; avatarUrl?: string | null };
const picture = (person: AvatarPerson) => person.imageUrl || person.avatarUrl || undefined;
/** Only a real picture earns an avatar. Nobody is shown as initials in a circle: where there is no photo, the name stands alone. */
export const hasPicture = (person: AvatarPerson) => Boolean(picture(person));
export const anyPicture = (people: AvatarPerson[]) => people.some(hasPicture);

/** More people than this collapse into an AvatarGroupCount. */
export const MAX_AVATARS = 3;

type Size = "default" | "sm" | "lg";

/**
 * The people on a story or a piece of work: nobody renders nothing, one person
 * a single Avatar, several an AvatarGroup, and anyone beyond `max` a
 * "+N" AvatarGroupCount. Each avatar is named for assistive tech; hover and
 * focus show a Tooltip with the name where the names are not printed nearby.
 */
export function PeopleAvatars({ people: everyone, max = MAX_AVATARS, size = "sm", tooltips = true, className }: { people: AvatarPerson[]; max?: number; size?: Size; tooltips?: boolean; className?: string }) {
  const people = everyone.filter(hasPicture);
  if (!people.length) return null;
  const shown = people.length === 1 ? people : people.slice(0, max);
  const rest = people.slice(shown.length);
  const named = (person: AvatarPerson, index: number) => {
    const avatar = <Avatar key={`${index}:${person.name}`} size={size} role="img" aria-label={person.name}><AvatarImage src={picture(person)} alt="" /></Avatar>;
    return tooltips
      ? <Tooltip key={`${index}:${person.name}`}><TooltipTrigger data-slot="avatar" render={avatar} /><TooltipContent>{person.name}</TooltipContent></Tooltip>
      : avatar;
  };
  if (people.length === 1) return named(people[0]!, 0);
  const restNames = rest.map((person) => person.name).join(", ");
  const count = rest.length ? <AvatarGroupCount role="img" aria-label={`and ${rest.length} more: ${restNames}`}>+{rest.length}</AvatarGroupCount> : null;
  return <AvatarGroup role="group" aria-label={people.map((person) => person.name).join(", ")} className={className}>
    {shown.map(named)}
    {count && tooltips ? <Tooltip><TooltipTrigger data-slot="avatar-group-count" render={count} /><TooltipContent>{restNames}</TooltipContent></Tooltip> : count}
  </AvatarGroup>;
}


/**
 * Dense people treatment for rows where names are intentionally not printed.
 * The AvatarGroup remains the trigger; hover or keyboard focus reveals every
 * person by name without making the row itself noisier.
 */
export function PeopleHoverCard({ people, max = MAX_AVATARS, size = "sm", className }: { people: AvatarPerson[]; max?: number; size?: Size; className?: string }) {
  const pictured = people.filter(hasPicture);
  if (!pictured.length) return null;
  return <HoverCard>
    <HoverCardTrigger render={<span className="inline-flex rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50" tabIndex={0} />}>
      <PeopleAvatars people={pictured} max={max} size={size} tooltips={false} className={className} />
    </HoverCardTrigger>
    <HoverCardContent align="end" className="w-64">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{pictured.length === 1 ? "Assigned person" : "Assigned people"}</p>
      <div className="flex flex-col gap-2">
        {pictured.map((person, index) => <div key={`${index}:${person.name}`} className="flex items-center gap-2">
          <Avatar size="sm"><AvatarImage src={picture(person)} alt="" /></Avatar>
          <span className="min-w-0 truncate font-medium">{person.name}</span>
        </div>)}
      </div>
    </HoverCardContent>
  </HoverCard>;
}
