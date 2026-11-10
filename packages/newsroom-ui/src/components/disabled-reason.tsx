import type { ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

/**
 * Says why a control is disabled. A disabled button receives no pointer or
 * focus events, so the reason sits on a focusable wrapper around it. With no
 * `reason` the control renders untouched.
 */
export function DisabledReason({ reason, children }: { reason?: ReactNode; children: ReactElement }) {
  if (!reason) return children;
  return <Tooltip>
    <TooltipTrigger render={<span tabIndex={0} data-disabled-reason="" className="inline-flex rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50" />}>{children}</TooltipTrigger>
    <TooltipContent>{reason}</TooltipContent>
  </Tooltip>;
}
