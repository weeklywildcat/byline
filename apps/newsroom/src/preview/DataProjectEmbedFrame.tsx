"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A Data Project's real presentation inside the Story editor and Live
 * Preview: the private `/preview/data` route in embed mode (the very same
 * `DataProjectPresentation` the public Story and the Data page render), in a
 * frame that sizes itself to its content. The frame is same-origin, but
 * sandboxed without top navigation, so nothing in it can move the Story
 * editor; links open separately. Published data when the project has a
 * published version (what readers get), working data when it is only a draft.
 */
export function DataProjectEmbedFrame({ projectId, source, title, version }: { projectId: number; source: "published" | "working"; title: string; version?: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [height, setHeight] = useState(160);
  const src = `/preview/data?project=${projectId}&data=${source}&embed=1${version ? `&v=${encodeURIComponent(version)}` : ""}`;

  const attach = useCallback(() => {
    stop.current?.();
    const element = frame.current;
    const doc = element?.contentDocument;
    const view = element?.contentWindow as (Window & typeof globalThis) | null | undefined;
    if (!doc || !view) return;
    const measure = () => setHeight(Math.max(120, Math.ceil(doc.documentElement.scrollHeight)));
    measure();
    const observer = typeof view.ResizeObserver === "function" ? new view.ResizeObserver(measure) : null;
    observer?.observe(doc.documentElement);
    observer?.observe(doc.body);
    view.addEventListener("resize", measure);
    stop.current = () => {
      observer?.disconnect();
      view.removeEventListener("resize", measure);
    };
  }, []);
  useEffect(() => () => stop.current?.(), []);

  return (
    <iframe
      ref={frame}
      className="byline-data-embed-frame"
      title={title}
      src={src}
      loading="lazy"
      sandbox="allow-same-origin allow-scripts allow-popups allow-popups-to-escape-sandbox"
      onLoad={attach}
      style={{ border: 0, display: "block", height, width: "100%" }}
    />
  );
}
