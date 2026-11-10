// shadcn base-nova Drawer over Base UI's Drawer. Local change: overlays portal into the Byline UI root (../lib/portal.ts).
// Reserved for task-focused secondary flows on touch. Inspectors use Sheet and small anchored pickers use Popover.
"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "../lib/utils"
import { useAdminPortal } from "../lib/portal"

function Drawer({ swipeDirection = "down", ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" swipeDirection={swipeDirection} {...props} />
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerContent({
  className,
  children,
  ...props
}: DrawerPrimitive.Popup.Props) {
  return (
    <DrawerPrimitive.Portal container={useAdminPortal()}>
      <DrawerPrimitive.VirtualKeyboardProvider>
        <DrawerPrimitive.Backdrop
          data-slot="drawer-overlay"
          className="fixed inset-0 z-50 min-h-dvh bg-black/20 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-300 data-ending-style:opacity-0 data-starting-style:opacity-0 data-swiping:duration-0 motion-reduce:transition-none"
        />
        <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="fixed inset-0 bottom-(--drawer-keyboard-inset) z-50 flex items-end justify-center">
          <DrawerPrimitive.Popup
            data-slot="drawer-content"
            className={cn(
              "flex max-h-[min(85dvh,100%)] w-full max-w-xl flex-col rounded-t-xl border-t bg-popover pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-popover-foreground shadow-lg outline-none [transform:translateY(var(--drawer-swipe-movement-y,0px))] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-swiping:select-none data-swiping:duration-0 data-ending-style:[transform:translateY(100%)] data-starting-style:[transform:translateY(100%)] motion-reduce:transition-none",
              className
            )}
            {...props}
          >
            <div aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
            <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</DrawerPrimitive.Content>
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPrimitive.VirtualKeyboardProvider>
    </DrawerPrimitive.Portal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex flex-col gap-1 px-4 pt-2 pb-3", className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex flex-col gap-2 px-4 pt-3", className)} {...props} />
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-base font-medium text-foreground", className)} {...props} />
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription }
