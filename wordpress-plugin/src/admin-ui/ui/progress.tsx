"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"
import { cn } from "../lib/utils"

function Progress({ className, children, value, ...props }: ProgressPrimitive.Root.Props) {
  return (
    <ProgressPrimitive.Root value={value} data-slot="progress" className={cn("flex flex-wrap items-center gap-2 text-sm", className)} {...props}>
      {children}
      <ProgressTrack><ProgressIndicator /></ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
  return <ProgressPrimitive.Track data-slot="progress-track" className={cn("relative flex h-2 w-full overflow-hidden rounded-full bg-secondary", className)} {...props} />
}

function ProgressIndicator({ className, ...props }: ProgressPrimitive.Indicator.Props) {
  return <ProgressPrimitive.Indicator data-slot="progress-indicator" className={cn("h-full bg-primary transition-all", className)} {...props} />
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
  return <ProgressPrimitive.Label data-slot="progress-label" className={cn("font-medium", className)} {...props} />
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
  return <ProgressPrimitive.Value data-slot="progress-value" className={cn("ml-auto tabular-nums text-muted-foreground", className)} {...props} />
}

export { Progress, ProgressTrack, ProgressIndicator, ProgressLabel, ProgressValue }
