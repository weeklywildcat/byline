import type { ComponentProps } from "react";
import { Avatar, AvatarImage } from "../ui/avatar";

/** One person as shadcn Avatar. Decorative unless the caller gives it a role and label. */
export function PersonAvatar({ name, url, size = "sm", ...props }: { name: string; url?: string | null } & ComponentProps<typeof Avatar>) {
  // No photo, no avatar: never a placeholder circle of initials.
  if (!url) return null;
  return <Avatar size={size} aria-hidden={props.role ? undefined : true} {...props}><AvatarImage src={url} alt="" /></Avatar>;
}
