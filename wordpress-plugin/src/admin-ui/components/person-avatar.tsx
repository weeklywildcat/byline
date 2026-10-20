import type { ComponentProps } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");

/** One person as shadcn Avatar. Decorative unless the caller gives it a role and label. */
export function PersonAvatar({ name, url, size = "sm", ...props }: { name: string; url?: string | null } & ComponentProps<typeof Avatar>) {
  return <Avatar size={size} aria-hidden={props.role ? undefined : true} {...props}><AvatarImage src={url ?? undefined} alt="" /><AvatarFallback>{initials(name)}</AvatarFallback></Avatar>;
}
