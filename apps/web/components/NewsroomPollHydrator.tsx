"use client";

import { useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PollWidget } from "@/components/PollWidget";
import type { ActivePoll } from "@/lib/polls";

type PollBlockPayload = ActivePoll & { votingOpen?: boolean };

function readPayload(script: Element): PollBlockPayload | null {
  try {
    const value = JSON.parse(script.textContent || "") as PollBlockPayload;
    return value && typeof value.id === "string" && Array.isArray(value.options) ? value : null;
  } catch {
    return null;
  }
}

/** Hydrates only server-rendered Byline poll blocks; homepage polls keep their existing path. */
export function NewsroomPollHydrator() {
  useEffect(() => {
    const roots: Array<{ root: Root; block: HTMLElement; host: HTMLDivElement; originalMarkup: string }> = [];
    const blocks = Array.from(document.querySelectorAll<HTMLElement>(".byline-poll-block[data-byline-poll-id]"));

    blocks.forEach((block) => {
      const script = block.querySelector(".byline-poll-data");
      const payload = script ? readPayload(script) : null;

      // Closed selected polls retain their static accessible results. Open polls
      // use PollWidget so the existing voter cookies and proxy endpoints remain
      // the only voting implementation.
      if (!payload || payload.votingOpen === false) {
        return;
      }

      const heading = block.querySelector("h2");
      const headingId = heading?.id || `${block.id || `byline-poll-${payload.id}`}-heading`;
      const headingText = heading?.textContent?.trim() || "Your Opinion";
      const originalMarkup = block.innerHTML;
      const host = document.createElement("div");
      host.className = "byline-poll-hydrated-root";
      block.replaceChildren(host);
      const root = createRoot(host);
      root.render(
        <PollWidget
          initialPoll={payload}
          heading={headingText}
          headingId={headingId}
          inputName={`byline-poll-${payload.id}`}
          className="byline-poll-card"
        />
      );
      roots.push({ root, block, host, originalMarkup });
    });

    return () => roots.forEach(({ root, block, host, originalMarkup }) => {
      root.unmount();
      // Restoring the server markup also makes the effect safe under React
      // StrictMode's development-only setup/cleanup/setup cycle.
      if (block.contains(host)) {
        block.innerHTML = originalMarkup;
      }
    });
  }, []);

  return null;
}
