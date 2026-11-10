"use client";

import { createContext, useContext, type ComponentProps, type ReactElement } from "react";
import { XIcon } from "lucide-react";
import { useAnyCoarsePointer } from "../lib/hooks";
import { cn } from "../lib/utils";
import { Button } from "./button";
import * as Dialog from "./dialog";
import * as Drawer from "./drawer";

const TouchSurface = createContext(false);

/** Compact forms use the same content and focus options in either modal. */
export function DialogRoot({ children, open, onOpenChange, modal }: Pick<ComponentProps<typeof Dialog.Dialog>, "children" | "open" | "modal"> & { onOpenChange?: (open: boolean) => void }) {
  const touch = useAnyCoarsePointer();
  return <TouchSurface.Provider value={touch}>
    {touch
      ? <Drawer.Drawer open={open} onOpenChange={onOpenChange} modal={modal}>{children}</Drawer.Drawer>
      : <Dialog.Dialog open={open} onOpenChange={onOpenChange} modal={modal}>{children}</Dialog.Dialog>}
  </TouchSurface.Provider>;
}

export function DialogContent({ className, children, showCloseButton = true, ...props }: ComponentProps<"div"> & Pick<ComponentProps<typeof Dialog.DialogContent>, "showCloseButton" | "initialFocus" | "finalFocus">) {
  if (!useContext(TouchSurface)) {
    return <Dialog.DialogContent className={className} showCloseButton={showCloseButton} {...props}>{children}</Dialog.DialogContent>;
  }
  return <Drawer.DrawerContent keyboardAware {...props}>
    <div className={cn("relative flex min-h-0 flex-1 flex-col gap-4 p-4", className, "w-full max-w-none sm:max-w-none")}>
      {children}
      {showCloseButton ? <Drawer.DrawerClose render={<Button type="button" variant="ghost" size="icon-sm" className="absolute top-1 right-2" aria-label="Close" />}><XIcon aria-hidden="true" /></Drawer.DrawerClose> : null}
    </div>
  </Drawer.DrawerContent>;
}

export function DialogTrigger(props: ComponentProps<"button"> & { render?: ReactElement }) {
  return useContext(TouchSurface)
    ? <Drawer.DrawerTrigger {...props} />
    : <Dialog.DialogTrigger {...props} />;
}

export function DialogClose(props: ComponentProps<typeof Dialog.DialogClose>) {
  return useContext(TouchSurface) ? <Drawer.DrawerClose {...props} /> : <Dialog.DialogClose {...props} />;
}

export function DialogTitle(props: ComponentProps<typeof Dialog.DialogTitle>) {
  return useContext(TouchSurface) ? <Drawer.DrawerTitle {...props} /> : <Dialog.DialogTitle {...props} />;
}

export function DialogDescription(props: ComponentProps<typeof Dialog.DialogDescription>) {
  return useContext(TouchSurface) ? <Drawer.DrawerDescription {...props} /> : <Dialog.DialogDescription {...props} />;
}

export function DialogHeader({ className, ...props }: ComponentProps<typeof Dialog.DialogHeader>) {
  const touch = useContext(TouchSurface);
  return <Dialog.DialogHeader className={cn(touch && "pr-10", className)} {...props} />;
}

export function DialogFooter({ className, ...props }: ComponentProps<typeof Dialog.DialogFooter>) {
  const touch = useContext(TouchSurface);
  if (!touch) return <Dialog.DialogFooter className={className} {...props} />;
  return <Drawer.DrawerFooter
    className={cn("sticky bottom-0 z-10 -mx-4 -mb-4 shrink-0 border-t bg-popover px-4 pb-4 pt-3", className)}
    {...props}
  />;
}
