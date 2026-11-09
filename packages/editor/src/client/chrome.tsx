"use client";

import { ARTICLE_BLOCKS, type ArticleBlockType, type BlockIssue } from "@byline/article-body";
import { Badge } from "@byline/newsroom-ui/ui/badge";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@byline/newsroom-ui/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@byline/newsroom-ui/ui/tooltip";
import { UNDO_COMMAND } from "@payloadcms/richtext-lexical/lexical";
import { ArrowDown, ArrowUp, Ellipsis, Trash2 } from "lucide-react";
import { cloneElement, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import { useAnnounce } from "./host";
import { BlockIcon } from "./icons";
import type { useBlockNode } from "./lexical";

/**
 * Editor chrome around a block: a small toolbar for the selected block
 * (label, its actions, a More menu), a calm note when the block is
 * unfinished, nothing else. The article underneath is the shared article
 * primitive, untouched. The toolbar shows for the selected or focused block
 * (and on hover with a mouse) and is always reachable by keyboard and touch.
 */

const COARSE = "(pointer: coarse), (max-width: 767px)";

/** Touch or a narrow screen: secondary settings open in a Sheet, targets grow to 44px. */
export function useCoarseLayout(): boolean {
  return useSyncExternalStore(
    (listener) => {
      if (typeof window === "undefined") return () => {};
      const query = window.matchMedia(COARSE);
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(COARSE).matches),
    () => false
  );
}

type Node = ReturnType<typeof useBlockNode>;

/** A Popover, menu or Sheet: portaled outside the block that opened it. */
const POPUP = '[data-slot="popover-content"], [data-slot="dropdown-menu-content"], [data-slot="sheet-content"], [role="dialog"], [role="menu"]';

/**
 * Keeps the block frame's editing state honest about what CSS cannot see
 * (canvas.css reads both):
 *
 * - `--byline-chrome-size`: the toolbar's rendered height, so the selected
 *   block reserves exactly the room its toolbar needs above it. A toolbar that
 *   wraps at a narrower column, or grows when an action appears, never covers
 *   the text above.
 * - `data-popup-held`: focus left the block for a popup the block opened.
 *   The popup is portaled, so `:focus-within` is false while it is open and
 *   through its exit animation, until focus returns to its trigger; without
 *   this the toolbar it is anchored to would fade and the reserved room
 *   collapse, moving the article under it. Cleared as soon as focus or a
 *   pointer lands anywhere else.
 */
function useBlockFrame() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const chrome = ref.current;
    const frame = chrome?.closest<HTMLElement>(".byline-block");
    if (!chrome || !frame) return;
    const write = () => frame.style.setProperty("--byline-chrome-size", `${Math.ceil(chrome.offsetHeight)}px`);
    write();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(write);
    observer?.observe(chrome);

    const doc = frame.ownerDocument;
    const release = () => {
      frame.removeAttribute("data-popup-held");
      doc.removeEventListener("focusin", onElsewhere, true);
      doc.removeEventListener("pointerdown", onElsewhere, true);
    };
    const inside = (target: EventTarget | null) => target instanceof Element && (frame.contains(target) || Boolean(target.closest(POPUP)));
    function onElsewhere(event: Event) {
      if (!inside(event.target)) release();
      else if (event.type === "focusin" && frame!.contains(event.target as Element)) release();
    }
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (!(next instanceof Element) || frame.contains(next) || !next.closest(POPUP)) return;
      frame.setAttribute("data-popup-held", "");
      doc.addEventListener("focusin", onElsewhere, true);
      doc.addEventListener("pointerdown", onElsewhere, true);
    };
    frame.addEventListener("focusout", onFocusOut);
    return () => {
      observer?.disconnect();
      frame.removeEventListener("focusout", onFocusOut);
      release();
      frame.style.removeProperty("--byline-chrome-size");
    };
  }, []);
  return ref;
}

export function BlockShell({ type, node, actions, issues, children, menuItems }: {
  type: ArticleBlockType;
  node: Node;
  /** ButtonGroups and ToggleGroups for this block's actions. */
  actions?: ReactNode;
  /** Readiness problems: the first shows under the selected block; an unselected one shows a badge. */
  issues?: readonly BlockIssue[];
  /** Extra entries at the top of the More menu. */
  menuItems?: ReactNode;
  children: ReactNode;
}) {
  const definition = ARTICLE_BLOCKS[type];
  const announce = useAnnounce();
  const [menuOpen, setMenuOpen] = useState(false);
  const chromeRef = useBlockFrame();
  const omitted = issues?.find((issue) => issue.effect === "omitted");
  const note = omitted ?? issues?.[0];

  const remove = () => {
    node.remove();
    announce(`${definition.label} removed.`);
    toast(`${definition.label} removed`, { action: { label: "Undo", onClick: () => node.editor.dispatchCommand(UNDO_COMMAND, undefined) } });
  };
  const move = (direction: -1 | 1) => {
    if (!node.move(direction)) return;
    announce(`${definition.label} moved ${direction < 0 ? "up" : "down"}.`);
  };

  return (
    <>
      {node.editable ? (
        <div ref={chromeRef} className="byline-block-chrome" role="toolbar" aria-label={`${definition.label} tools`} data-open={menuOpen || undefined} data-byline-chrome="" contentEditable={false}>
          <span className="byline-block-chrome-label">
            <BlockIcon icon={definition.icon} />
            {definition.label}
          </span>
          {actions}
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More ${definition.label} actions`} data-block-more="" />}>
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              {menuItems}
              <DropdownMenuItem disabled={node.position === "first" || node.position === "only"} onClick={() => move(-1)}>
                <ArrowUp />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={node.position === "last" || node.position === "only"} onClick={() => move(1)}>
                <ArrowDown />
                Move down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={remove}>
                <Trash2 />
                Remove {definition.label.toLowerCase()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
      {children}
      {note && node.editable ? (
        <p className="byline-block-note" data-effect={note.effect} data-byline-chrome="" contentEditable={false}>
          <Badge variant="outline">{omitted ? "Not published yet" : "Left out"}</Badge>
          <span>{note.message}</span>
        </p>
      ) : null}
    </>
  );
}

/** An icon button with its name in a tooltip. */
export function ToolButton({ label, onClick, disabled, children, pressed }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A labelled text button in a block toolbar. */
export function ToolTextButton({ label, onClick, disabled, icon }: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

export { ButtonGroup };

/**
 * A compact surface for secondary options: a Popover beside its trigger with a
 * mouse, a bottom Sheet on touch or a narrow screen. Controlled, so the caller
 * can open it itself (a new footnote opens its note straight away).
 */
export function SettingsSurface({ open, onOpenChange, trigger, title, description, align = "start", children }: {
  open: boolean;
  /** `details.reason` is Base UI's ("escape-key", "outside-press", …) when it closes the surface. */
  onOpenChange: (open: boolean, details?: { reason?: string }) => void;
  /** The element that opens it. On touch it is given an `onClick` that opens the Sheet. */
  trigger: ReactElement;
  title: string;
  description?: string;
  align?: "start" | "center" | "end";
  children: ReactNode;
}) {
  const coarse = useCoarseLayout();
  if (coarse) {
    return (
      <>
        {cloneElement(trigger as ReactElement<{ onClick?: () => void }>, { onClick: () => onOpenChange(true) })}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="gap-3 p-4" data-byline-chrome="">
            <SheetHeader className="p-0">
              <SheetTitle>{title}</SheetTitle>
              {description ? <SheetDescription>{description}</SheetDescription> : null}
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent align={align} className="w-80" data-byline-chrome="">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
          {description ? <PopoverDescription>{description}</PopoverDescription> : null}
        </PopoverHeader>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * A compact secondary setting (alt text, page references): a labelled button
 * that opens a SettingsSurface. Nothing needed to finish a block lives only here.
 */
export function SecondarySetting({ label, title, description, icon, children }: { label: string; title: string; description?: string; icon: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSurface
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      trigger={
        <Button type="button" variant="ghost" size="sm" aria-label={label}>
          {icon}
          {label}
        </Button>
      }
    >
      {children}
    </SettingsSurface>
  );
}
