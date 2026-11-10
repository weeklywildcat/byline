import type { ComponentProps } from "react";
import { cn } from "../lib/utils";
import { Item } from "../ui/item";

/** An Item that is a button: Nova's link-Item hover, on a real `<button>` the whole row activates. */
export function ItemButton({ className, ...props }: ComponentProps<typeof Item>) {
  return <Item render={<button type="button" />} className={cn("cursor-pointer any-pointer-coarse:min-h-11 text-left hover:bg-muted", className)} {...props} />;
}
