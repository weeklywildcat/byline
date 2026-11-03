import { useState } from "react"
import type { CSSProperties } from "react"
import type { LucideIcon } from "lucide-react"

import { AdminPortalContext } from "../admin-ui/lib/portal"
import { useIsMobile } from "../admin-ui/lib/hooks"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "../admin-ui/ui/sidebar"

export type SettingsSidebarItem = {
  id: string
  label: string
  href: string
  icon: LucideIcon
}

export type SettingsSidebarGroup = {
  label: string
  items: SettingsSidebarItem[]
}

function SettingsSidebarNavigation({
  groups,
  activeId,
}: {
  groups: SettingsSidebarGroup[]
  activeId: string
}) {
  return (
    <SidebarContent aria-label="Settings sections">
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = activeId === item.id
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      render={
                        <a
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                        />
                      }
                      isActive={active}
                    >
                      <Icon aria-hidden="true" />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </SidebarContent>
  )
}

/**
 * Settings still lives in the WordPress React admin entrypoint. Keep the Nova
 * reset/theme constrained to this navigation island so legacy settings forms
 * remain untouched while the rail uses the real shadcn Sidebar primitives.
 */
export function SettingsSidebar({
  groups,
  activeId,
}: {
  groups: SettingsSidebarGroup[]
  activeId: string
}) {
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null)
  const isMobile = useIsMobile()

  return (
    <div className="byline-ui-root byline-settings-sidebar-root" ref={setPortalRoot}>
      <AdminPortalContext.Provider value={portalRoot}>
        {portalRoot ? (
          <SidebarProvider
            className="min-h-0 w-auto flex-none"
            style={
              {
                "--sidebar-width": "14rem",
                "--sidebar-width-mobile": "18rem",
              } as CSSProperties
            }
          >
            <div className="flex items-center gap-2 pb-2 md:hidden">
              <SidebarTrigger aria-label="Open settings navigation" />
              <span className="text-sm font-medium text-foreground">
                Settings sections
              </span>
            </div>
            <Sidebar
              collapsible={isMobile ? "offcanvas" : "none"}
              className="md:sticky md:top-12 md:h-fit md:max-h-[calc(100vh-5rem)] md:border-r md:border-sidebar-border"
            >
              <SettingsSidebarNavigation groups={groups} activeId={activeId} />
            </Sidebar>
          </SidebarProvider>
        ) : null}
      </AdminPortalContext.Provider>
    </div>
  )
}
