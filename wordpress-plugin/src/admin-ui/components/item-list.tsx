import { Children, Fragment, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { Item, ItemGroup, ItemSeparator } from "../ui/item";

/**
 * A list of Item rows with hairlines between them. ItemGroup is `role="list"`,
 * so each row is wrapped as a list item; the Item inside stays whatever it is
 * (a button, a link, a label).
 */
export function ItemList({ children, className, ...props }: ComponentProps<typeof ItemGroup>) {
  const rows = Children.toArray(children);
  return <ItemGroup className={cn("gap-0 has-data-[size=sm]:gap-0 has-data-[size=xs]:gap-0 [&_[data-slot=item]]:rounded-none [&_[data-slot=item]]:focus-visible:ring-inset", className)} {...props}>
    {rows.map((row, index) => <Fragment key={index}>
      {index > 0 ? <ItemSeparator role="presentation" className="my-0" /> : null}
      <div role="listitem">{row}</div>
    </Fragment>)}
  </ItemGroup>;
}

/** An Item that is a button: whole-row hit target with the same hover Nova gives link Items. */
export function ItemButton({ className, ...props }: ComponentProps<typeof Item>) {
  return <Item render={<button type="button" />} className={cn("cursor-pointer text-left hover:bg-muted", className)} {...props} />;
}

export function ItemHint({ children }: { children: ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}
