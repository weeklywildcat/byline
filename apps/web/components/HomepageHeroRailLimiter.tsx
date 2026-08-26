"use client";

import { useEffect } from "react";

const DESKTOP_QUERY = "(min-width: 1041px)";

export function HomepageHeroRailLimiter() {
  useEffect(() => {
    const layout = document.querySelector<HTMLElement>("[data-homepage-top-stories]");
    const lead = document.querySelector<HTMLElement>("[data-homepage-lead]");

    if (!layout || !lead) {
      return;
    }

    const mediaQuery = window.matchMedia(DESKTOP_QUERY);

    const syncRailHeight = () => {
      if (mediaQuery.matches) {
        layout.style.setProperty("--top-stories-hero-height", `${Math.ceil(lead.getBoundingClientRect().height)}px`);
      } else {
        layout.style.removeProperty("--top-stories-hero-height");
      }
    };

    const resizeObserver = new ResizeObserver(syncRailHeight);
    resizeObserver.observe(lead);
    syncRailHeight();

    mediaQuery.addEventListener("change", syncRailHeight);
    window.addEventListener("load", syncRailHeight);

    return () => {
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", syncRailHeight);
      window.removeEventListener("load", syncRailHeight);
      layout.style.removeProperty("--top-stories-hero-height");
    };
  }, []);

  return null;
}
