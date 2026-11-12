"use client";

import { useEffect, useRef } from "react";
import { interactives, PREVIEW_MARKER } from "@byline/site/preview";

export function SiteSpikeInteractives() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    for (const entry of interactives) {
      void entry.styles?.();
      void entry.client?.().then(({ default: start }) => {
        const target = root.current?.querySelector<HTMLElement>("[data-spike-counter]");
        if (target) start(target);
      });
    }
  }, []);
  return (
    <div ref={root} data-preview-marker={PREVIEW_MARKER}>
      {interactives.map(({ id, Component }) => <Component key={id} />)}
    </div>
  );
}
