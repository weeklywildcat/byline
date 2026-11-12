"use client";

import { useEffect, useState } from "react";

type Slot = { id: string; label: string; storyId: number | null; pinned: boolean; href: string | null };
type Box = { id: string; top: number; left: number; width: number; height: number };

/**
 * Editor-only slot overlays over the real homepage rendering: "LEAD · PINNED"
 * or "LEAD · AUTO", drawn around the Story each slot resolved to. Choosing one
 * tells the desk (same-origin postMessage); the desk tells it which slot is
 * selected. Overlays are outlines with a small tab that sits outside the
 * outline, above its top-right corner: it never covers the Story's kicker,
 * date or headline.
 */
export function FrontPageSlotOverlays({ slots, issues }: { slots: Slot[]; issues: number }) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const measure = () => {
      const next: Box[] = [];
      for (const slot of slots) {
        if (!slot.href) continue;
        const link = [...document.querySelectorAll<HTMLAnchorElement>("main a[href]")].find((anchor) => anchor.getAttribute("href") === slot.href);
        const target = link?.closest("article") ?? link?.parentElement;
        if (!target) continue;
        const rect = target.getBoundingClientRect();
        next.push({ id: slot.id, top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height });
      }
      setBoxes(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("load", measure);
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== "byline-front-page:selected") return;
      setSelected(typeof event.data.slot === "string" ? event.data.slot : null);
    };
    window.addEventListener("message", receive);
    return () => { observer.disconnect(); window.removeEventListener("load", measure); window.removeEventListener("message", receive); };
  }, [slots]);
  const choose = (slot: string) => {
    setSelected(slot);
    window.parent?.postMessage({ type: "byline-front-page:choose", slot }, window.location.origin);
  };
  const bySlot = new Map(slots.map((slot) => [slot.id, slot]));
  return (
    <div aria-label="Homepage slots" data-slot-overlays="" data-issues={issues}>
      {boxes.map((box) => {
        const slot = bySlot.get(box.id)!;
        const active = selected === box.id;
        const color = slot.pinned ? "#7b2336" : "#2563eb";
        return (
          <div key={box.id} data-slot-overlay={box.id} data-pinned={slot.pinned ? "" : undefined} style={{ position: "absolute", top: box.top - 3, left: box.left - 3, width: box.width + 6, height: box.height + 6, outline: `${active ? 3 : 1.5}px ${slot.pinned ? "solid" : "dashed"} ${color}`, borderRadius: 4, pointerEvents: "none", zIndex: 40 }}>
            <button
              type="button"
              onClick={() => choose(box.id)}
              aria-pressed={active}
              style={{ position: "absolute", top: 0, right: 6, transform: "translateY(-100%)", pointerEvents: "auto", font: "600 10px/1 system-ui, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap", color: "#fff", background: color, border: 0, borderRadius: "3px 3px 0 0", padding: "3px 6px", cursor: "pointer" }}
            >
              {slot.label} · {slot.pinned ? "Pinned" : "Auto"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
