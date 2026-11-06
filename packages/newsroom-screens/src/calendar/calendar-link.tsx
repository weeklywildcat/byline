import { createContext, use, type ComponentProps, type MouseEvent } from "react";

const NavigateContext = createContext<((href: string) => void) | null>(null);

/** The host's client navigation for links inside the calendar (absent: ordinary page loads). */
export const CalendarNavigateProvider = NavigateContext;

const opensElsewhere = (event: MouseEvent<HTMLAnchorElement>) => event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

/** A link inside the calendar: the host's client navigation for a plain click, an ordinary link otherwise. */
export function CalendarLink({ href, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const navigate = use(NavigateContext);
  return <a href={href} {...props} onClick={(event) => {
    onClick?.(event);
    if (!navigate || event.defaultPrevented || opensElsewhere(event)) return;
    event.preventDefault();
    navigate(href);
  }} />;
}
