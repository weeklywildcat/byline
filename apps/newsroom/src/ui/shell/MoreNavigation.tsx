"use client";

import { useMediaQuery } from "@byline/newsroom-ui/lib/hooks";
import { Button } from "@byline/newsroom-ui/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@byline/newsroom-ui/ui/drawer";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@byline/newsroom-ui/ui/popover";
import { Ellipsis, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Role } from "../../domain/vocabulary";
import { MorePanel } from "./MorePanel";
import { ADAPTIVE_NAVIGATION_QUERY, BOTTOM_NAVIGATION_QUERY } from "./shell-config";

export type MoreAccount = { admin: string; role: Role; hasProfile: boolean; loginHref: string; logoutUrl: string };

const MORE_SNAP_POINTS = [0.85, 1];

export function MoreNavigation(account: MoreAccount) {
  const compact = useMediaQuery(BOTTOM_NAVIGATION_QUERY);
  const adaptive = useMediaQuery(ADAPTIVE_NAVIGATION_QUERY);
  const desiredSurface = compact ? "drawer" : "popover";
  const [surface, setSurface] = useState<typeof desiredSurface | null>(null);
  const [open, setOpen] = useState(false);
  const [snapPoint, setSnapPoint] = useState<number | string | null>(MORE_SNAP_POINTS[0]);
  const pending = useRef<(() => void) | null>(null);

  // Keep the current surface mounted through dismissal so a pending guarded
  // action can take focus after the overlay releases it, even during a resize.
  const presentation = surface ?? desiredSurface;
  useEffect(() => {
    if (!adaptive || presentation !== desiredSurface) setOpen(false);
  }, [adaptive, presentation, desiredSurface]);

  function onOpenChange(next: boolean) {
    if (next) {
      if (pending.current) return;
      setSurface(presentation);
      setSnapPoint(MORE_SNAP_POINTS[0]);
    }
    setOpen(next);
  }

  function onOpenChangeComplete(next: boolean) {
    if (next) return;
    setSurface(null);
    const action = pending.current;
    pending.current = null;
    action?.();
  }

  function afterClose(action: () => void) {
    pending.current = action;
    setOpen(false);
  }

  const trigger = <button type="button" aria-haspopup="dialog" className="byline-primary-link byline-more-trigger appearance-none bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring" />;
  const label = <><Ellipsis className="size-5 shrink-0" aria-hidden="true" />More</>;
  const panel = <MorePanel {...account} afterClose={afterClose} />;

  // The popup translates down at the short snap point. Match that offset
  // in its padding so the scrollable content ends above the safe area.
  return presentation === "drawer" ? (
    <Drawer open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete} modal snapPoints={MORE_SNAP_POINTS} snapPoint={snapPoint} onSnapPointChange={setSnapPoint} snapToSequentialPoints>
      <DrawerTrigger render={trigger}>{label}</DrawerTrigger>
      <DrawerContent className="h-dvh max-h-none shadow-none pt-[max(0px,calc(env(safe-area-inset-top,0px)-var(--drawer-snap-point-offset)))] pb-[calc(max(1rem,env(safe-area-inset-bottom,0px))+var(--drawer-snap-point-offset))] [transform:translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))]">
        <DrawerHeader className="sticky top-0 z-10 flex-row items-center justify-between bg-popover py-0">
          <DrawerTitle>More</DrawerTitle>
          <DrawerDescription className="sr-only">Newsroom workspaces and account tools</DrawerDescription>
          <DrawerClose render={<Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Close More" />}><X aria-hidden="true" /></DrawerClose>
        </DrawerHeader>
        {panel}
      </DrawerContent>
    </Drawer>
  ) : (
    <Popover open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <PopoverTrigger render={trigger}>{label}</PopoverTrigger>
      <PopoverContent align="start" className="max-h-(--available-height) w-72 overflow-y-auto overscroll-contain">
        <PopoverTitle className="sr-only">More</PopoverTitle>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
