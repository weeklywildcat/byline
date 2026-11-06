"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@byline/newsroom-ui/ui/sidebar";
import { ChevronDown, FileText, ListTodo, Plus, Upload, type LucideIcon } from "lucide-react";
import type { CreateKind } from "../../domain/navigation";
import { useBylineCreate } from "./create";

const ICONS: Record<CreateKind, LucideIcon> = { story: FileText, task: ListTodo, media: Upload };

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
            <DropdownMenuTrigger render={<SidebarMenuButton type="button" tooltip={compact ? { children: "Create", hidden: false } : "Create"} aria-label="Create" className={cn(primary, compact && "px-2.5 md:px-2")} />}>
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
