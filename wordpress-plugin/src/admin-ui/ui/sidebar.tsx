"use client"

import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { PanelLeft } from "lucide-react"
import { cn } from "../lib/utils"
import { useMediaQuery } from "../lib/hooks"
import { Button } from "./button"
import { ScrollArea } from "./scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./sheet"

type SidebarContextValue = {
  mobile: boolean
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const value = React.useContext(SidebarContext)
  if (!value) throw new Error("Sidebar components must be used inside SidebarProvider.")
  return value
}

function SidebarProvider({ children, className, ...props }: React.ComponentProps<"div">) {
  const mobile = useMediaQuery("(max-width: 767px)")
  const [openMobile, setOpenMobile] = React.useState(false)
  const value = React.useMemo(() => ({ mobile, openMobile, setOpenMobile }), [mobile, openMobile])
  return <SidebarContext.Provider value={value}>
    <div data-slot="sidebar-wrapper" className={cn("flex min-w-0 items-start gap-6", className)} {...props}>{children}</div>
  </SidebarContext.Provider>
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { mobile, openMobile, setOpenMobile } = useSidebar()
  if (mobile) {
    return <Sheet open={openMobile} onOpenChange={setOpenMobile}>
      <SheetContent side="left" className="w-[18rem] p-0">
        <SheetHeader className="border-b"><SheetTitle>Settings</SheetTitle><SheetDescription>Choose a Byline settings section.</SheetDescription></SheetHeader>
        <ScrollArea className="min-h-0 flex-1"><aside data-slot="sidebar" className={cn("flex flex-col p-2", className)} {...props}>{children}</aside></ScrollArea>
      </SheetContent>
    </Sheet>
  }
  return <aside data-slot="sidebar" className={cn("sticky top-12 hidden w-52 shrink-0 border-r pr-3 md:block", className)} {...props}><ScrollArea className="max-h-[calc(100dvh-4rem)]"><div className="pr-1">{children}</div></ScrollArea></aside>
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { mobile, setOpenMobile } = useSidebar()
  if (!mobile) return null
  return <Button data-slot="sidebar-trigger" variant="outline" size="sm" className={className} onClick={() => setOpenMobile(true)} {...props}>
    <PanelLeft data-icon="inline-start" aria-hidden="true" />Settings sections
  </Button>
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex min-h-0 flex-col gap-4", className)} {...props} />
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="sidebar-group" className={cn("flex min-w-0 flex-col gap-1", className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 data-slot="sidebar-group-label" className={cn("px-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase", className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex min-w-0 flex-col gap-0.5", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("min-w-0", className)} {...props} />
}

function SidebarMenuButton({
  className,
  render,
  isActive = false,
  ...props
}: useRender.ComponentProps<"button"> & { isActive?: boolean }) {
  const { mobile, setOpenMobile } = useSidebar()
  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        "data-active": isActive || undefined,
        onClick: () => { if (mobile) setOpenMobile(false) },
        className: cn(
          "flex min-h-8 w-full items-center rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-muted data-active:font-medium data-active:text-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: { slot: "sidebar-menu-button", active: isActive }
  })
}

function SidebarInset({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="sidebar-inset" className={cn("min-w-0 flex-1", className)} {...props} />
}

export {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  useSidebar
}
