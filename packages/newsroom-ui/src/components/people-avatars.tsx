import { Avatar, AvatarGroup, AvatarGroupCount, AvatarImage } from "../ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

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
