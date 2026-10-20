"use client"

import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { cn } from "../lib/utils"
import { useAdminPortal } from "../lib/portal"

type DrawerContextValue = {
  modal: DrawerPrimitive.Root.Props["modal"]
  showSwipeHandle: boolean
  swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>
}

const DrawerContext = React.createContext<DrawerContextValue | null>(null)

function useDrawer() {
  const value = React.useContext(DrawerContext)
  if (!value) throw new Error("Drawer components must be used inside Drawer.")
  return value
}

function Drawer({ modal = true, showSwipeHandle = true, swipeDirection = "down", ...props }: DrawerPrimitive.Root.Props & { showSwipeHandle?: boolean }) {
  const value = React.useMemo(() => ({ modal, showSwipeHandle, swipeDirection }), [modal, showSwipeHandle, swipeDirection])
  return <DrawerContext.Provider value={value}><DrawerPrimitive.Root data-slot="drawer" modal={modal} swipeDirection={swipeDirection} {...props} /></DrawerContext.Provider>
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal container={useAdminPortal()} data-slot="drawer-portal" {...props} />
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return <DrawerPrimitive.Backdrop data-slot="drawer-overlay" className={cn("fixed inset-0 z-50 bg-black/20 backdrop-blur-xs transition-opacity data-starting-style:opacity-0 data-ending-style:opacity-0", className)} {...props} />
}

function DrawerContent({ className, children, ...props }: DrawerPrimitive.Popup.Props) {
  const { modal, showSwipeHandle, swipeDirection } = useDrawer()
  const vertical = swipeDirection === "down" || swipeDirection === "up"
  return (
    <DrawerPortal>
      {modal ? <DrawerOverlay /> : null}
      <DrawerPrimitive.Viewport data-slot="drawer-viewport" data-modal={modal} className="pointer-events-none fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          data-swipe-direction={swipeDirection}
          className={cn(
            "pointer-events-auto fixed z-50 flex min-h-0 flex-col overflow-hidden bg-popover text-sm text-popover-foreground shadow-2xl outline-none ring-1 ring-foreground/10 transition-transform duration-300 ease-out",
            vertical && "inset-x-0 max-h-[92dvh] rounded-t-2xl",
            swipeDirection === "down" && "bottom-0 data-starting-style:translate-y-full data-ending-style:translate-y-full",
            swipeDirection === "up" && "top-0 rounded-b-2xl rounded-t-none data-starting-style:-translate-y-full data-ending-style:-translate-y-full",
            swipeDirection === "left" && "inset-y-0 left-0 w-[85vw] max-w-sm rounded-r-2xl data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
            swipeDirection === "right" && "inset-y-0 right-0 w-[85vw] max-w-sm rounded-l-2xl data-starting-style:translate-x-full data-ending-style:translate-x-full",
            className
          )}
          {...props}
        >
          {showSwipeHandle && vertical ? <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" /> : null}
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex shrink-0 flex-col gap-1.5 px-4 pt-4 pb-2 text-center", className)} {...props} />
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/40 p-4 sm:flex-row sm:justify-end", className)} {...props} />
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("font-heading text-base font-medium", className)} {...props} />
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

export { Drawer, DrawerPortal, DrawerOverlay, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription, DrawerClose }
