import * as React from "react"
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "../lib/utils"
import { Button } from "./button"

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return <nav role="navigation" aria-label="pagination" data-slot="pagination" className={cn("mx-auto flex w-full justify-center", className)} {...props} />
}
function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="pagination-content" className={cn("flex items-center gap-1", className)} {...props} />
}
function PaginationItem(props: React.ComponentProps<"li">) { return <li data-slot="pagination-item" {...props} /> }
function PaginationButton({ isActive, className, ...props }: React.ComponentProps<typeof Button> & { isActive?: boolean }) {
  return <Button variant={isActive ? "outline" : "ghost"} size="icon-sm" aria-current={isActive ? "page" : undefined} className={className} {...props} />
}
function PaginationPrevious(props: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" size="sm" aria-label="Go to previous page" {...props}><ChevronLeft data-icon="inline-start" aria-hidden="true" /><span className="hidden sm:inline">Previous</span></Button>
}
function PaginationNext(props: React.ComponentProps<typeof Button>) {
  return <Button variant="ghost" size="sm" aria-label="Go to next page" {...props}><span className="hidden sm:inline">Next</span><ChevronRight data-icon="inline-end" aria-hidden="true" /></Button>
}
function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return <span aria-hidden="true" data-slot="pagination-ellipsis" className={cn("flex size-8 items-center justify-center text-muted-foreground", className)} {...props}><MoreHorizontal className="size-4" /><span className="sr-only">More pages</span></span>
}
export { Pagination, PaginationContent, PaginationItem, PaginationButton, PaginationPrevious, PaginationNext, PaginationEllipsis }
