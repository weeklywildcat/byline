"use client";

import { useState } from "react";
import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { cn } from "@byline/newsroom-ui/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { ChevronDown, FileText, Layers, ListTodo, Plus, Upload, type LucideIcon } from "lucide-react";
import type { CreateAction, CreateKind } from "../../domain/navigation";
import { useBylineCreate } from "./create";
import { BOTTOM_NAVIGATION_QUERY } from "./shell-config";

const ICONS: Record<CreateKind, LucideIcon> = { story: FileText, task: ListTodo, collection: Layers, media: Upload };

// The one prominent action in the sidebar: primary colors, quiet otherwise.
const primary = "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground data-open:bg-primary/90 data-open:hover:bg-primary/90 data-open:hover:text-primary-foreground focus-visible:ring-ring/50";

/**
 * Create, from anywhere in the newsroom. Expanded: "Create" makes a story
 * (the primary action) and the chevron lists everything this account can
 * create. Collapsed to icons there is no room for two targets, so the "+"
 * opens that list. `compact` is the Story workspace's icon rail, which is
 * icons while the sidebar around it is expanded: there the "+" always opens
 * the list (with its tooltip), never creating a story outright. On a phone
 * the sheet closes before the dialog opens.
 */
export function CreateMenu({ compact = false }: { compact?: boolean }) {
  const { actions, openCreate } = useBylineCreate();
  const { state, isMobile, setOpenMobile } = useSidebar();
  if (!actions.length) return null;
  const [main, ...more] = actions;
  const collapsed = compact || (state === "collapsed" && !isMobile);
  const start = (kind: CreateKind) => {
    if (isMobile) setOpenMobile(false);
    openCreate(kind);
  };
  const menu = (
    <DropdownMenuContent side={collapsed ? "right" : "bottom"} align={collapsed ? "start" : "end"} className="min-w-48">
      <DropdownMenuGroup>
        <DropdownMenuLabel>Create</DropdownMenuLabel>
        {actions.map((action) => {
          const Icon = ICONS[action.kind];
          return <DropdownMenuItem key={action.kind} onClick={() => start(action.kind)}><Icon aria-hidden="true" />{action.label}</DropdownMenuItem>;
        })}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {collapsed && (more.length || compact) ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<SidebarMenuButton type="button" tooltip={compact ? { children: "Create", hidden: false } : "Create"} aria-label="Create" className={cn(primary, compact && "px-2.5 md:px-2 any-pointer-coarse:justify-center")} />}>
              <Plus aria-hidden="true" />
              <span className={cn(compact && "sr-only")}>Create</span>
            </DropdownMenuTrigger>
            {menu}
          </DropdownMenu>
        ) : (
          <>
            <SidebarMenuButton type="button" tooltip={`Create ${main.label.toLowerCase()}`} aria-label={`Create ${main.label.toLowerCase()}`} className={cn(primary, "font-medium")} onClick={() => start(main.kind)} data-create-primary="">
              <Plus aria-hidden="true" />
              <span>Create</span>
            </SidebarMenuButton>
            {more.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger render={<SidebarMenuAction type="button" aria-label="More to create" className="top-1.5! text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground peer-hover/menu-button:text-primary-foreground data-open:bg-primary-foreground/15" />}>
                  <ChevronDown aria-hidden="true" />
                </DropdownMenuTrigger>
                {menu}
              </DropdownMenu>
            ) : null}
          </>
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** The same creation actions in a phone drawer or a tablet menu. */
export function HeaderCreate() {
  const phone = useMediaQuery(BOTTOM_NAVIGATION_QUERY);
  const { actions, openCreate } = useBylineCreate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [choice, setChoice] = useState<CreateKind | null>(null);
  if (!actions.length) return null;

  const trigger = <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Create" />;
  const actionContent = ({ kind, label }: CreateAction) => {
    const Icon = ICONS[kind];
    return <><Icon aria-hidden="true" />{kind === "media" ? label : `New ${label.toLowerCase()}`}</>;
  };

  return (
    <div className="byline-header-create">
      {phone || drawerOpen || choice ? (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} onOpenChangeComplete={(open) => {
          if (!open && choice) {
            openCreate(choice);
            setChoice(null);
          }
        }}>
          <DrawerTrigger render={trigger}><Plus aria-hidden="true" /></DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Create</DrawerTitle>
              <DrawerDescription>Choose what to create in Byline.</DrawerDescription>
            </DrawerHeader>
            <div className="grid gap-1 px-3">
              {actions.map((action) => (
                <Button key={action.kind} type="button" variant="ghost" className="h-11 justify-start gap-3" onClick={() => {
                  setChoice(action.kind);
                  setDrawerOpen(false);
                }}>{actionContent(action)}</Button>
              ))}
            </div>
            <DrawerFooter>
              <DrawerClose render={<Button type="button" variant="outline" className="h-11" />}>Cancel</DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger}><Plus aria-hidden="true" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Create</DropdownMenuLabel>
              {actions.map((action) => (
                <DropdownMenuItem key={action.kind} className="min-h-11" onClick={() => openCreate(action.kind)}>{actionContent(action)}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
