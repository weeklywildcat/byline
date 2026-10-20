import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { AdminPortalContext } from "../lib/portal";
import { cn } from "../lib/utils";
import { TooltipProvider } from "../ui/tooltip";

/**
 * The one boundary for the React 19 admin screens (Home, Story Workspace): the
 * scoped theme root, the portal container for every overlay, tooltips and
 * toasts. Children mount once the root exists so portals always have a target.
 */
export function AdminRoot({ className, children }: { className?: string; children: ReactNode }) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  return <div className={cn("byline-ui-root", className)} ref={setRoot}>
    <AdminPortalContext value={root}>
      <TooltipProvider>
        {root ? children : null}
        <Toaster position="bottom-right" closeButton toastOptions={{ className: "font-sans text-sm" }} />
      </TooltipProvider>
    </AdminPortalContext>
  </div>;
}
