"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "../lib/utils"

function Switch({ className, size = "default", ...props }: SwitchPrimitive.Root.Props & { size?: "sm" | "default" }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-input transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[size=sm]:h-4 data-[size=sm]:w-7",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="pointer-events-none block size-4 translate-x-0 rounded-full bg-background shadow-sm transition-transform group-data-checked/switch:translate-x-4 group-data-[size=sm]/switch:size-3 group-data-checked/switch:group-data-[size=sm]/switch:translate-x-3" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
