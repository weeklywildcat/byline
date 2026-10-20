import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

export function PersonAvatar({ name, url }: { name: string; url?: string }) {
  return <Avatar size="sm"><AvatarImage src={url} alt="" /><AvatarFallback>{name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</AvatarFallback></Avatar>;
}
